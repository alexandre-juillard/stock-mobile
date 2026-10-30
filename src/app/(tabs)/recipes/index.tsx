import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { Card, Chip, FAB, Searchbar, Text } from 'react-native-paper';

import { RecipeFeasibilityBadge, type RecipeFeasibilityStatus } from '@/components/ui/recipe-feasibility-badge';
import { MutedText } from '@/components/ui/muted-text';
import { ScreenShell } from '@/components/ui/screen-shell';
import { StateMessage } from '@/components/ui/state-message';
import { buildRecipeDetailRoute, RECIPE_FORM_ROUTE } from '@/constants/routes';
import { radius, spacing } from '@/constants/theme';
import { useIsOffline } from '@/hooks/use-is-offline';
import type {
  RecipeDetailResponse,
  RecipeIngredientResponse,
  RecipeSummaryResponse,
  StockItemResponse,
} from '@/services/api/generated/model';
import { getRecipe, useListRecipes } from '@/services/api/generated/recettes/recettes';
import { useListStockItems } from '@/services/api/generated/stock/stock';
import { mapErrorToUi } from '@/utils/error-mapper';
import { formatDate, normalizeQuantity } from '@/utils/format';

type FeasibilityFilter = 'all' | 'ready' | 'missing';

interface RecipeFeasibilityInfo {
  status: RecipeFeasibilityStatus;
  missingCount?: number;
}

interface RecipeListItem {
  recipe: RecipeSummaryResponse;
  feasibility: RecipeFeasibilityInfo;
}

function formatCreatedAtLabel(value: string | undefined): string {
  return (value ? formatDate(value) : null) ?? 'Date de creation indisponible';
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
  const isOffline = useIsOffline();

  const [searchQuery, setSearchQuery] = useState('');
  const [feasibilityFilter, setFeasibilityFilter] = useState<FeasibilityFilter>('all');

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
              <MutedText>{item.recipe.ingredientCount ?? 0} ingredient(s)</MutedText>
              <MutedText>Creee le {formatCreatedAtLabel(item.recipe.createdAt)}</MutedText>
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
      {isOffline ? <MutedText>Tu es hors ligne: affichage du dernier etat synchronise.</MutedText> : null}

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
        <MutedText>
          Le statut &quot;realisable&quot; est temporairement indisponible pour certaines recettes.
        </MutedText>
      ) : null}

      {isInitialLoading ? (
        <StateMessage message="Chargement de tes recettes..." />
      ) : hasBlockingError ? (
        <StateMessage
          tone="error"
          icon="alert-circle-outline"
          message={mapErrorToUi(recipesQuery.error ?? stockItemsQuery.error).message}
        />
      ) : filteredRecipes.length === 0 ? (
        <StateMessage
          icon="chef-hat"
          message={
            recipes.length === 0 ? 'Aucune recette pour le moment.' : 'Aucune recette ne correspond a tes filtres.'
          }
        />
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
  searchbar: {
    elevation: 0,
  },
  filtersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  list: {
    flex: 1,
  },
  listContent: {
    gap: spacing.sm,
    paddingBottom: 96,
  },
  recipeCard: {
    borderRadius: radius.cardLarge,
  },
  recipeCardContent: {
    gap: spacing.sm,
  },
  recipeHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  recipeName: {
    flex: 1,
  },
  recipeMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
  },
});
