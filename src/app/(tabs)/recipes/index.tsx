import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNetInfo } from '@react-native-community/netinfo';
import { useQuery } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { Card, Chip, FAB, Searchbar, Text } from 'react-native-paper';

import { RecipeFeasibilityBadge, type RecipeFeasibilityStatus } from '@/components/ui/recipe-feasibility-badge';
import { ScreenShell } from '@/components/ui/screen-shell';
import type {
  RecipeDetailResponse,
  RecipeIngredientResponse,
  RecipeSummaryResponse,
  StockItemResponse,
} from '@/services/api/generated/model';
import { getRecipe, useListRecipes } from '@/services/api/generated/recettes/recettes';
import { useListStockItems } from '@/services/api/generated/stock/stock';
import { mapErrorToUi } from '@/utils/error-mapper';

const RECIPE_FORM_ROUTE = '/(tabs)/recipes/form' as Href;

type FeasibilityFilter = 'all' | 'ready' | 'missing';

interface RecipeFeasibilityInfo {
  status: RecipeFeasibilityStatus;
  missingCount?: number;
}

interface RecipeListItem {
  recipe: RecipeSummaryResponse;
  feasibility: RecipeFeasibilityInfo;
}

function buildRecipeDetailRoute(recipeId: string): Href {
  return `/(tabs)/recipes/${recipeId}` as Href;
}

function normalizeQuantity(value: number | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0;
  }

  return value;
}

function formatCreatedAtLabel(value: string | undefined): string {
  if (!value) {
    return 'Date de creation indisponible';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Date de creation indisponible';
  }

  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

function isIngredientSatisfied(
  ingredient: RecipeIngredientResponse,
  stockByProductId: Map<string, StockItemResponse>
): boolean {
  const productId = ingredient.product?.id;
  if (!productId) {
    return false;
  }

  const requiredQuantity = normalizeQuantity(ingredient.quantity);
  if (requiredQuantity <= 0) {
    return false;
  }

  const stockItem = stockByProductId.get(productId);
  if (!stockItem) {
    return false;
  }

  const ingredientUnitId = ingredient.unit?.id;
  const stockUnitId = stockItem.product?.baseUnit?.id;
  if (ingredientUnitId && stockUnitId && ingredientUnitId !== stockUnitId) {
    return false;
  }

  const availableQuantity = normalizeQuantity(stockItem.quantity);
  return availableQuantity >= requiredQuantity;
}

function computeRecipeFeasibility(
  recipeDetail: RecipeDetailResponse | undefined,
  stockByProductId: Map<string, StockItemResponse>
): RecipeFeasibilityInfo {
  if (!recipeDetail) {
    return { status: 'unknown' };
  }

  const ingredients = recipeDetail.ingredients ?? [];
  if (ingredients.length === 0) {
    return { status: 'missing' };
  }

  const missingCount = ingredients.reduce((count, ingredient) => {
    return isIngredientSatisfied(ingredient, stockByProductId) ? count : count + 1;
  }, 0);

  if (missingCount === 0) {
    return { status: 'ready' };
  }

  return {
    status: 'missing',
    missingCount,
  };
}

export default function RecipesListScreen() {
  const router = useRouter();
  const netInfo = useNetInfo();

  const [searchQuery, setSearchQuery] = useState('');
  const [feasibilityFilter, setFeasibilityFilter] = useState<FeasibilityFilter>('all');

  const isOffline = netInfo.isConnected === false || netInfo.isInternetReachable === false;

  const recipesQuery = useListRecipes();
  const stockItemsQuery = useListStockItems();

  const recipes = useMemo(() => recipesQuery.data?.data ?? [], [recipesQuery.data]);

  const recipeIds = useMemo(() => {
    return recipes.map((recipe) => recipe.id).filter((recipeId): recipeId is string => Boolean(recipeId));
  }, [recipes]);

  const recipeDetailsQuery = useQuery({
    queryKey: ['recipes-details', recipeIds],
    enabled: recipeIds.length > 0,
    queryFn: async () => {
      const detailsEntries = await Promise.all(
        recipeIds.map(async (recipeId) => {
          const detailResponse = await getRecipe(recipeId);
          return [recipeId, detailResponse.data] as const;
        })
      );

      return Object.fromEntries(detailsEntries) as Record<string, RecipeDetailResponse>;
    },
  });

  const stockByProductId = useMemo(() => {
    const stockMap = new Map<string, StockItemResponse>();

    for (const stockItem of stockItemsQuery.data?.data ?? []) {
      const productId = stockItem.product?.id;
      if (!productId) {
        continue;
      }

      stockMap.set(productId, stockItem);
    }

    return stockMap;
  }, [stockItemsQuery.data]);

  const recipesWithFeasibility = useMemo<RecipeListItem[]>(() => {
    const recipeDetailsById = recipeDetailsQuery.data ?? {};

    return recipes.map((recipe) => {
      const recipeDetail = recipe.id ? recipeDetailsById[recipe.id] : undefined;

      return {
        recipe,
        feasibility: computeRecipeFeasibility(recipeDetail, stockByProductId),
      };
    });
  }, [recipeDetailsQuery.data, recipes, stockByProductId]);

  const filteredRecipes = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return recipesWithFeasibility.filter(({ recipe, feasibility }) => {
      const matchesSearch = normalizedQuery
        ? (recipe.name ?? '').toLowerCase().includes(normalizedQuery)
        : true;

      const matchesFeasibility =
        feasibilityFilter === 'all'
          ? true
          : feasibilityFilter === 'ready'
            ? feasibility.status === 'ready'
            : feasibility.status === 'missing';

      return matchesSearch && matchesFeasibility;
    });
  }, [feasibilityFilter, recipesWithFeasibility, searchQuery]);

  const handleRefresh = useCallback(async () => {
    await Promise.all([
      recipesQuery.refetch(),
      stockItemsQuery.refetch(),
      recipeDetailsQuery.refetch(),
    ]);
  }, [recipeDetailsQuery, recipesQuery, stockItemsQuery]);

  const isRefreshing = recipesQuery.isFetching || stockItemsQuery.isFetching || recipeDetailsQuery.isFetching;

  const renderRecipe = useCallback(
    ({ item }: { item: RecipeListItem }) => {
      const recipeId = item.recipe.id;
      if (!recipeId) {
        return null;
      }

      return (
        <Card style={styles.recipeCard} onPress={() => router.push(buildRecipeDetailRoute(recipeId))}>
          <Card.Content style={styles.recipeCardContent}>
            <View style={styles.recipeHeader}>
              <Text variant="titleMedium" style={styles.recipeName}>
                {item.recipe.name ?? 'Recette sans nom'}
              </Text>
              <RecipeFeasibilityBadge
                status={item.feasibility.status}
                missingCount={item.feasibility.missingCount}
              />
            </View>

            <View style={styles.recipeMetaRow}>
              <Text style={styles.recipeMetaText}>
                {item.recipe.ingredientCount ?? 0} ingredient(s)
              </Text>
              <Text style={styles.recipeMetaText}>Creee le {formatCreatedAtLabel(item.recipe.createdAt)}</Text>
            </View>
          </Card.Content>
        </Card>
      );
    },
    [router]
  );

  const isInitialLoading =
    recipesQuery.isLoading ||
    stockItemsQuery.isLoading ||
    (recipeIds.length > 0 && recipeDetailsQuery.isLoading);

  const hasBlockingError = recipesQuery.isError || stockItemsQuery.isError;
  const hasDetailsError = recipeDetailsQuery.isError;

  return (
    <ScreenShell title="Recettes" subtitle="Retrouve tes recettes et vois celles realisables avec ton stock.">
      {isOffline ? (
        <Text style={styles.offlineText}>Tu es hors ligne: affichage du dernier etat synchronise.</Text>
      ) : null}

      <Searchbar
        placeholder="Rechercher une recette"
        value={searchQuery}
        onChangeText={setSearchQuery}
        style={styles.searchbar}
      />

      <View style={styles.filtersRow}>
        <Chip
          selected={feasibilityFilter === 'all'}
          mode={feasibilityFilter === 'all' ? 'flat' : 'outlined'}
          onPress={() => setFeasibilityFilter('all')}>
          Toutes
        </Chip>
        <Chip
          selected={feasibilityFilter === 'ready'}
          mode={feasibilityFilter === 'ready' ? 'flat' : 'outlined'}
          onPress={() => setFeasibilityFilter('ready')}>
          Realisables
        </Chip>
        <Chip
          selected={feasibilityFilter === 'missing'}
          mode={feasibilityFilter === 'missing' ? 'flat' : 'outlined'}
          onPress={() => setFeasibilityFilter('missing')}>
          A completer
        </Chip>
      </View>

      {hasDetailsError ? (
        <Text style={styles.detailsErrorText}>
          Le statut &quot;realisable&quot; est temporairement indisponible pour certaines recettes.
        </Text>
      ) : null}

      {isInitialLoading ? (
        <View style={styles.centeredState}>
          <Text>Chargement de tes recettes...</Text>
        </View>
      ) : hasBlockingError ? (
        <View style={styles.centeredState}>
          <MaterialCommunityIcons name="alert-circle-outline" size={32} color="#D90429" />
          <Text style={styles.errorText}>{mapErrorToUi(recipesQuery.error ?? stockItemsQuery.error).message}</Text>
        </View>
      ) : filteredRecipes.length === 0 ? (
        <View style={styles.centeredState}>
          <MaterialCommunityIcons name="chef-hat" size={32} color="#60646C" />
          <Text style={styles.emptyText}>
            {recipes.length === 0 ? 'Aucune recette pour le moment.' : 'Aucune recette ne correspond a tes filtres.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredRecipes}
          keyExtractor={(item, index) => item.recipe.id ?? `recipe-${index}`}
          renderItem={renderRecipe}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void handleRefresh()} />}
        />
      )}

      <FAB
        icon="plus"
        label="Creer une recette"
        style={styles.fab}
        onPress={() => router.push(RECIPE_FORM_ROUTE)}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  offlineText: {
    opacity: 0.8,
  },
  searchbar: {
    elevation: 0,
  },
  filtersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  detailsErrorText: {
    opacity: 0.85,
  },
  centeredState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  errorText: {
    textAlign: 'center',
    color: '#D90429',
  },
  emptyText: {
    textAlign: 'center',
    opacity: 0.8,
  },
  list: {
    flex: 1,
  },
  listContent: {
    gap: 8,
    paddingBottom: 96,
  },
  recipeCard: {
    elevation: 1,
    borderRadius: 18,
  },
  recipeCardContent: {
    gap: 8,
  },
  recipeHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  recipeName: {
    flex: 1,
  },
  recipeMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  recipeMetaText: {
    opacity: 0.75,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
  },
});

