import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNetInfo } from '@react-native-community/netinfo';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, Dialog, Portal, Snackbar, Text } from 'react-native-paper';

import { ScreenShell } from '@/components/ui/screen-shell';
import { useAddShoppingListItem } from '@/services/api/generated/liste-de-courses/liste-de-courses';
import type { RecipeIngredientResponse, StockItemResponse } from '@/services/api/generated/model';
import {
  consumeRecipe,
  deleteRecipe,
  useConsumeRecipe,
  useDeleteRecipe,
  useGetRecipe,
} from '@/services/api/generated/recettes/recettes';
import { useListStockItems } from '@/services/api/generated/stock/stock';
import { ApiClientError } from '@/services/api/http-client';
import { queryKeys } from '@/services/api/query-keys';
import { invalidateRecipeRelatedQueries } from '@/services/api/query-invalidations';
import {
  clearRecipeReplayConflicts,
  enqueuePendingRecipeAction,
  extractRecipeConsumeConflictFromError,
  flushPendingRecipeActions,
  getPendingRecipeActionsCount,
  listRecipeReplayConflicts,
  type EnqueuePendingRecipeActionInput,
  type RecipeConsumeConflict,
} from '@/services/offline/recipe-actions-queue';
import { mapErrorToUi } from '@/utils/error-mapper';

const RECIPES_ROUTE = '/(tabs)/recipes' as Href;
const RECIPE_FORM_ROUTE = '/(tabs)/recipes/form';

const DANGER_COLOR = '#D90429';
const WARNING_COLOR = '#E9C46A';

type IngredientAvailabilityStatus = 'available' | 'missing' | 'insufficient' | 'unit_mismatch';

interface IngredientAvailability {
  productId: string | null;
  productName: string;
  requiredQuantity: number;
  requiredUnitLabel: string;
  status: IngredientAvailabilityStatus;
  availableQuantity: number;
  availableUnitLabel: string;
}

interface MissingProductCandidate {
  productId: string;
  name: string;
}

function getFirstRouteParamValue(param: string | string[] | undefined): string | null {
  if (!param) {
    return null;
  }

  return Array.isArray(param) ? (param[0] ?? null) : param;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeQuantity(value: number | undefined): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0;
  }

  return value;
}

function formatQuantity(value: number): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(value);
}

function extractConsumeResultCount(payload: unknown): number {
  if (!isRecord(payload)) {
    return 0;
  }

  const rawResults = payload.results;
  return Array.isArray(rawResults) ? rawResults.length : 0;
}

function shouldQueueAfterError(error: unknown): boolean {
  return !(error instanceof ApiClientError && error.status >= 400 && error.status < 500);
}

function evaluateIngredientAvailability(
  ingredient: RecipeIngredientResponse,
  stockByProductId: Map<string, StockItemResponse>
): IngredientAvailability {
  const productId = ingredient.product?.id ?? null;
  const productName = ingredient.product?.name ?? 'Produit inconnu';
  const requiredQuantity = normalizeQuantity(ingredient.quantity);
  const requiredUnitLabel = ingredient.unit?.label ?? ingredient.unit?.code ?? 'unite';

  const defaultItem: IngredientAvailability = {
    productId,
    productName,
    requiredQuantity,
    requiredUnitLabel,
    status: 'missing',
    availableQuantity: 0,
    availableUnitLabel: requiredUnitLabel,
  };

  if (!productId) {
    return defaultItem;
  }

  const stockItem = stockByProductId.get(productId);
  if (!stockItem) {
    return defaultItem;
  }

  const availableQuantity = normalizeQuantity(stockItem.quantity);
  const availableUnitLabel =
    stockItem.product?.baseUnit?.label ?? stockItem.product?.baseUnit?.code ?? requiredUnitLabel;

  const ingredientUnitId = ingredient.unit?.id;
  const stockUnitId = stockItem.product?.baseUnit?.id;

  if (ingredientUnitId && stockUnitId && ingredientUnitId !== stockUnitId) {
    return {
      ...defaultItem,
      status: 'unit_mismatch',
      availableQuantity,
      availableUnitLabel,
    };
  }

  if (availableQuantity >= requiredQuantity && requiredQuantity > 0) {
    return {
      ...defaultItem,
      status: 'available',
      availableQuantity,
      availableUnitLabel,
    };
  }

  return {
    ...defaultItem,
    status: 'insufficient',
    availableQuantity,
    availableUnitLabel,
  };
}

function buildMissingProductsFromConflict(conflict: RecipeConsumeConflict): MissingProductCandidate[] {
  const byProductId = new Map<string, MissingProductCandidate>();

  for (const missingItem of conflict.missing) {
    byProductId.set(missingItem.productId, {
      productId: missingItem.productId,
      name: missingItem.name,
    });
  }

  for (const insufficientItem of conflict.insufficient) {
    byProductId.set(insufficientItem.productId, {
      productId: insufficientItem.productId,
      name: insufficientItem.name,
    });
  }

  return [...byProductId.values()];
}

function buildMissingProductsFromIngredients(
  ingredients: IngredientAvailability[]
): MissingProductCandidate[] {
  const byProductId = new Map<string, MissingProductCandidate>();

  for (const ingredient of ingredients) {
    if (ingredient.status === 'available' || !ingredient.productId) {
      continue;
    }

    byProductId.set(ingredient.productId, {
      productId: ingredient.productId,
      name: ingredient.productName,
    });
  }

  return [...byProductId.values()];
}

function getIngredientStatusVisual(status: IngredientAvailabilityStatus): {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  color: string;
} {
  if (status === 'available') {
    return {
      icon: 'check-circle-outline',
      label: 'Disponible',
      color: '#52B788',
    };
  }

  if (status === 'missing') {
    return {
      icon: 'close-circle-outline',
      label: 'Absent du stock',
      color: DANGER_COLOR,
    };
  }

  if (status === 'insufficient') {
    return {
      icon: 'alert-outline',
      label: 'Quantite insuffisante',
      color: WARNING_COLOR,
    };
  }

  return {
    icon: 'swap-horizontal',
    label: 'Unite differente',
    color: '#F4A261',
  };
}

export default function RecipeDetailScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const netInfo = useNetInfo();

  const { recipeId: recipeIdParam } = useLocalSearchParams<{ recipeId?: string | string[] }>();
  const recipeId = useMemo(() => getFirstRouteParamValue(recipeIdParam), [recipeIdParam]);

  const [consumeConflict, setConsumeConflict] = useState<RecipeConsumeConflict | null>(null);
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);
  const [isDeleteDialogVisible, setIsDeleteDialogVisible] = useState(false);
  const [isSyncingQueue, setIsSyncingQueue] = useState(false);
  const [isAddingMissingToShoppingList, setIsAddingMissingToShoppingList] = useState(false);

  const isOffline = netInfo.isConnected === false || netInfo.isInternetReachable === false;

  const recipeQuery = useGetRecipe(recipeId ?? '', {
    query: {
      enabled: Boolean(recipeId),
    },
  });
  const stockItemsQuery = useListStockItems();

  const consumeRecipeMutation = useConsumeRecipe();
  const deleteRecipeMutation = useDeleteRecipe();
  const addShoppingListItemMutation = useAddShoppingListItem();

  const {
    data: pendingActionsCount = 0,
    refetch: refreshPendingActionsCount,
  } = useQuery({
    queryKey: ['offline-recipe-actions-count', recipeId ?? 'unknown'],
    queryFn: () => getPendingRecipeActionsCount(recipeId ?? undefined),
    enabled: Boolean(recipeId),
  });

  const {
    data: replayConflicts = [],
    refetch: refreshReplayConflicts,
  } = useQuery({
    queryKey: ['offline-recipe-replay-conflicts', recipeId ?? 'unknown'],
    queryFn: () => listRecipeReplayConflicts(recipeId ?? undefined),
    enabled: Boolean(recipeId),
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

  const ingredientAvailabilities = useMemo(() => {
    return (recipeQuery.data?.data.ingredients ?? []).map((ingredient) =>
      evaluateIngredientAvailability(ingredient, stockByProductId)
    );
  }, [recipeQuery.data, stockByProductId]);

  const activeConflict = useMemo(() => {
    if (consumeConflict) {
      return consumeConflict;
    }

    return replayConflicts[0]?.conflict ?? null;
  }, [consumeConflict, replayConflicts]);

  const missingProductsForShoppingList = useMemo(() => {
    if (activeConflict) {
      return buildMissingProductsFromConflict(activeConflict);
    }

    return buildMissingProductsFromIngredients(ingredientAvailabilities);
  }, [activeConflict, ingredientAvailabilities]);

  const availableIngredientsCount = useMemo(() => {
    return ingredientAvailabilities.filter((ingredient) => ingredient.status === 'available').length;
  }, [ingredientAvailabilities]);

  const isSubmitting =
    isSyncingQueue ||
    isAddingMissingToShoppingList ||
    consumeRecipeMutation.isPending ||
    deleteRecipeMutation.isPending ||
    addShoppingListItemMutation.isPending;

  const handleRefresh = useCallback(async () => {
    await Promise.all([
      recipeQuery.refetch(),
      stockItemsQuery.refetch(),
      refreshPendingActionsCount(),
      refreshReplayConflicts(),
    ]);
  }, [recipeQuery, refreshPendingActionsCount, refreshReplayConflicts, stockItemsQuery]);

  const handleSyncPendingActions = useCallback(async () => {
    if (!recipeId || isOffline || isSyncingQueue) {
      return;
    }

    setIsSyncingQueue(true);

    try {
      const result = await flushPendingRecipeActions({
        consume: async (queuedRecipeId, force) => {
          await consumeRecipe(queuedRecipeId, force ? { force: true } : undefined);
        },
        delete: async (queuedRecipeId) => {
          await deleteRecipe(queuedRecipeId);
        },
      });

      if (result.syncedCount > 0) {
        await invalidateRecipeRelatedQueries(queryClient, recipeId);
      }

      await Promise.all([refreshPendingActionsCount(), refreshReplayConflicts()]);

      if (result.status === 'business_conflict' || result.conflictCount > 0) {
        setSnackbarMessage(`${result.conflictCount} conflit(s) detecte(s) apres synchronisation.`);
        return;
      }

      if (result.status === 'retry_later' && result.retryCount > 0) {
        setSnackbarMessage(
          `${result.syncedCount} action(s) synchronisee(s), ${result.retryCount} encore en attente.`
        );
        return;
      }

      if (result.status === 'failed' && result.failedCount > 0) {
        setSnackbarMessage(`${result.failedCount} action(s) n ont pas pu etre rejouee(s).`);
        return;
      }

      if (result.status === 'synced' && result.syncedCount > 0) {
        setSnackbarMessage(`${result.syncedCount} action(s) hors ligne synchronisee(s).`);
      }
    } finally {
      setIsSyncingQueue(false);
    }
  }, [
    isOffline,
    isSyncingQueue,
    queryClient,
    recipeId,
    refreshPendingActionsCount,
    refreshReplayConflicts,
  ]);

  const handleConsume = useCallback(
    async (force: boolean) => {
      if (!recipeId) {
        return;
      }

      const pendingAction: EnqueuePendingRecipeActionInput = {
        type: 'consume',
        recipeId,
        force,
      };

      if (isOffline) {
        await enqueuePendingRecipeAction(pendingAction);
        await refreshPendingActionsCount();
        setSnackbarMessage(
          force
            ? 'Consommation forcee enregistree hors ligne.'
            : 'Consommation enregistree hors ligne.'
        );
        return;
      }

      try {
        const response = await consumeRecipeMutation.mutateAsync({
          id: recipeId,
          params: force ? { force: true } : undefined,
        });

        const consumeResultCount = extractConsumeResultCount(response.data);

        setConsumeConflict(null);
        await clearRecipeReplayConflicts(recipeId);
        await refreshReplayConflicts();
        await invalidateRecipeRelatedQueries(queryClient, recipeId);

        setSnackbarMessage(
          consumeResultCount > 0
            ? `${consumeResultCount} ingredient(s) deduit(s) du stock.`
            : 'Recette consommee.'
        );
      } catch (error) {
        const conflict = extractRecipeConsumeConflictFromError(error);
        if (conflict) {
          setConsumeConflict(conflict);
          setSnackbarMessage('Conflit detecte: verifie les ingredients ou consomme en force.');
          return;
        }

        if (shouldQueueAfterError(error)) {
          await enqueuePendingRecipeAction(pendingAction);
          await refreshPendingActionsCount();
          setSnackbarMessage('Reseau instable: consommation mise en file hors ligne.');
          return;
        }

        setSnackbarMessage(mapErrorToUi(error).message);
      }
    },
    [
      consumeRecipeMutation,
      isOffline,
      queryClient,
      recipeId,
      refreshPendingActionsCount,
      refreshReplayConflicts,
    ]
  );

  const handleDeleteRecipe = useCallback(async () => {
    if (!recipeId) {
      return;
    }

    setIsDeleteDialogVisible(false);

    const pendingAction: EnqueuePendingRecipeActionInput = {
      type: 'delete',
      recipeId,
    };

    if (isOffline) {
      await enqueuePendingRecipeAction(pendingAction);
      await refreshPendingActionsCount();
      router.replace(RECIPES_ROUTE);
      return;
    }

    try {
      await deleteRecipeMutation.mutateAsync({ id: recipeId });
      await invalidateRecipeRelatedQueries(queryClient, recipeId);
      router.replace(RECIPES_ROUTE);
    } catch (error) {
      if (shouldQueueAfterError(error)) {
        await enqueuePendingRecipeAction(pendingAction);
        await refreshPendingActionsCount();
        router.replace(RECIPES_ROUTE);
        return;
      }

      setSnackbarMessage(mapErrorToUi(error).message);
    }
  }, [deleteRecipeMutation, isOffline, queryClient, recipeId, refreshPendingActionsCount, router]);

  const handleAddMissingToShoppingList = useCallback(async () => {
    if (missingProductsForShoppingList.length === 0) {
      setSnackbarMessage('Aucun ingredient manquant a ajouter.');
      return;
    }

    if (isOffline) {
      setSnackbarMessage('Ajout aux courses indisponible hors ligne.');
      return;
    }

    setIsAddingMissingToShoppingList(true);

    try {
      let addedCount = 0;
      let alreadyExistsCount = 0;
      let failedCount = 0;

      for (const missingProduct of missingProductsForShoppingList) {
        try {
          await addShoppingListItemMutation.mutateAsync({
            data: { productId: missingProduct.productId },
          });
          addedCount += 1;
        } catch (error) {
          if (error instanceof ApiClientError && error.status === 409) {
            alreadyExistsCount += 1;
            continue;
          }

          failedCount += 1;
        }
      }

      await queryClient.invalidateQueries({ queryKey: queryKeys.shoppingList.list });

      const feedbackParts: string[] = [];
      if (addedCount > 0) {
        feedbackParts.push(`${addedCount} ajoute(s)`);
      }
      if (alreadyExistsCount > 0) {
        feedbackParts.push(`${alreadyExistsCount} deja present(s)`);
      }
      if (failedCount > 0) {
        feedbackParts.push(`${failedCount} en echec`);
      }

      setSnackbarMessage(
        feedbackParts.length > 0
          ? `Courses: ${feedbackParts.join(', ')}.`
          : 'Aucun ajout realise sur la liste de courses.'
      );
    } finally {
      setIsAddingMissingToShoppingList(false);
    }
  }, [addShoppingListItemMutation, isOffline, missingProductsForShoppingList, queryClient]);

  const handleEditRecipe = useCallback(() => {
    if (!recipeId) {
      return;
    }

    router.push(`${RECIPE_FORM_ROUTE}?recipeId=${encodeURIComponent(recipeId)}` as Href);
  }, [recipeId, router]);

  const handleDismissConflict = useCallback(async () => {
    setConsumeConflict(null);

    if (!recipeId) {
      return;
    }

    await clearRecipeReplayConflicts(recipeId);
    await refreshReplayConflicts();
  }, [recipeId, refreshReplayConflicts]);

  if (!recipeId) {
    return (
      <ScreenShell title="Detail recette">
        <View style={styles.centeredState}>
          <MaterialCommunityIcons name="alert-circle-outline" size={32} color={DANGER_COLOR} />
          <Text style={styles.errorText}>Identifiant recette manquant.</Text>
          <Button mode="outlined" onPress={() => router.replace(RECIPES_ROUTE)}>
            Retour aux recettes
          </Button>
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell title="Detail recette" subtitle="Verifie les ingredients et gere la consommation.">
      {isOffline ? (
        <Text style={styles.offlineText}>Tu es hors ligne: actions placees en file de synchronisation.</Text>
      ) : null}

      {pendingActionsCount > 0 ? (
        <Card mode="outlined" style={styles.pendingCard}>
          <Card.Content style={styles.pendingCardContent}>
            <Text>{pendingActionsCount} action(s) recette en attente.</Text>
            {!isOffline ? (
              <Button
                mode="outlined"
                icon="sync"
                onPress={() => void handleSyncPendingActions()}
                loading={isSyncingQueue}
                disabled={isSubmitting}>
                Synchroniser
              </Button>
            ) : null}
          </Card.Content>
        </Card>
      ) : null}

      {recipeQuery.isLoading || stockItemsQuery.isLoading ? (
        <View style={styles.centeredState}>
          <Text>Chargement de la recette...</Text>
        </View>
      ) : recipeQuery.isError || stockItemsQuery.isError ? (
        <View style={styles.centeredState}>
          <MaterialCommunityIcons name="alert-circle-outline" size={32} color={DANGER_COLOR} />
          <Text style={styles.errorText}>{mapErrorToUi(recipeQuery.error ?? stockItemsQuery.error).message}</Text>
          <Button mode="outlined" onPress={() => void handleRefresh()}>
            Reessayer
          </Button>
        </View>
      ) : !recipeQuery.data?.data ? (
        <View style={styles.centeredState}>
          <Text style={styles.errorText}>Recette introuvable.</Text>
          <Button mode="outlined" onPress={() => router.replace(RECIPES_ROUTE)}>
            Retour aux recettes
          </Button>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Card style={styles.headerCard}>
            <Card.Content style={styles.headerCardContent}>
              <Text variant="titleLarge">{recipeQuery.data.data.name ?? 'Recette sans nom'}</Text>
              <Text style={styles.headerMetaText}>
                {ingredientAvailabilities.length} ingredient(s) dont {availableIngredientsCount} disponible(s)
              </Text>
            </Card.Content>
          </Card>

          {activeConflict ? (
            <Card mode="outlined" style={styles.conflictCard}>
              <Card.Content style={styles.conflictCardContent}>
                <Text variant="titleMedium" style={styles.conflictTitle}>
                  Conflit de consommation detecte
                </Text>
                <Text style={styles.conflictHintText}>
                  Certains ingredients sont absents ou insuffisants. Tu peux ajouter les manquants aux
                  courses ou forcer la consommation.
                </Text>

                {activeConflict.missing.length > 0 ? (
                  <View style={styles.conflictListBlock}>
                    <Text variant="labelLarge">Absents du stock</Text>
                    {activeConflict.missing.map((missingItem) => (
                      <Text key={`missing-${missingItem.productId}`} style={styles.conflictListItem}>
                        - {missingItem.name}
                      </Text>
                    ))}
                  </View>
                ) : null}

                {activeConflict.insufficient.length > 0 ? (
                  <View style={styles.conflictListBlock}>
                    <Text variant="labelLarge">Quantite insuffisante</Text>
                    {activeConflict.insufficient.map((insufficientItem) => (
                      <Text key={`insufficient-${insufficientItem.productId}`} style={styles.conflictListItem}>
                        - {insufficientItem.name}: {formatQuantity(insufficientItem.available)} dispo /{' '}
                        {formatQuantity(insufficientItem.required)} requis
                      </Text>
                    ))}
                  </View>
                ) : null}

                <View style={styles.conflictActionsRow}>
                  <Button
                    mode="outlined"
                    icon="cart-plus"
                    onPress={() => void handleAddMissingToShoppingList()}
                    loading={isAddingMissingToShoppingList}
                    disabled={isSubmitting}>
                    Ajouter aux courses
                  </Button>
                  <Button
                    mode="contained"
                    icon="alert"
                    onPress={() => void handleConsume(true)}
                    disabled={isSubmitting}>
                    Consommer en force
                  </Button>
                </View>

                <Button mode="text" onPress={() => void handleDismissConflict()} disabled={isSubmitting}>
                  Fermer le conflit
                </Button>
              </Card.Content>
            </Card>
          ) : null}

          <Card mode="outlined" style={styles.ingredientsCard}>
            <Card.Content style={styles.ingredientsCardContent}>
              <Text variant="titleMedium">Ingredients</Text>

              {ingredientAvailabilities.length === 0 ? (
                <Text style={styles.emptyText}>Cette recette ne contient pas encore d ingredients.</Text>
              ) : (
                ingredientAvailabilities.map((ingredientItem, index) => {
                  const statusVisual = getIngredientStatusVisual(ingredientItem.status);

                  return (
                    <View key={`${ingredientItem.productId ?? 'unknown'}-${index}`} style={styles.ingredientRow}>
                      <MaterialCommunityIcons
                        name={statusVisual.icon}
                        size={20}
                        color={statusVisual.color}
                        style={styles.ingredientIcon}
                      />
                      <View style={styles.ingredientTextBlock}>
                        <Text variant="titleMedium">{ingredientItem.productName}</Text>
                        <Text style={styles.ingredientMetaText}>
                          Requis: {formatQuantity(ingredientItem.requiredQuantity)} {ingredientItem.requiredUnitLabel}
                        </Text>
                        <Text style={styles.ingredientMetaText}>
                          Disponible: {formatQuantity(ingredientItem.availableQuantity)}{' '}
                          {ingredientItem.availableUnitLabel}
                        </Text>
                        <Text style={[styles.ingredientStatusText, { color: statusVisual.color }]}>
                          {statusVisual.label}
                        </Text>
                      </View>
                    </View>
                  );
                })
              )}
            </Card.Content>
          </Card>

          <Card style={styles.actionsCard}>
            <Card.Content style={styles.actionsCardContent}>
              <Button mode="contained" icon="silverware-fork-knife" onPress={() => void handleConsume(false)} disabled={isSubmitting}>
                Consommer la recette
              </Button>

              <Button
                mode="outlined"
                icon="cart-plus"
                onPress={() => void handleAddMissingToShoppingList()}
                loading={isAddingMissingToShoppingList}
                disabled={isSubmitting || missingProductsForShoppingList.length === 0}>
                Ajouter les manquants aux courses
              </Button>

              <Button mode="outlined" icon="pencil" onPress={handleEditRecipe} disabled={isSubmitting}>
                Editer la recette
              </Button>

              <Button
                mode="contained"
                icon="delete-outline"
                buttonColor={DANGER_COLOR}
                textColor="#FFFFFF"
                onPress={() => setIsDeleteDialogVisible(true)}
                disabled={isSubmitting}>
                Supprimer la recette
              </Button>

              {!isOffline ? (
                <Button mode="text" icon="refresh" onPress={() => void handleRefresh()} disabled={isSubmitting}>
                  Rafraichir
                </Button>
              ) : null}
            </Card.Content>
          </Card>
        </ScrollView>
      )}

      <Portal>
        <Dialog visible={isDeleteDialogVisible} onDismiss={() => setIsDeleteDialogVisible(false)}>
          <Dialog.Title>Supprimer cette recette ?</Dialog.Title>
          <Dialog.Content>
            <Text>La recette sera retiree de ta liste. Cette action est irreversible.</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setIsDeleteDialogVisible(false)} disabled={isSubmitting}>
              Annuler
            </Button>
            <Button
              textColor={DANGER_COLOR}
              onPress={() => void handleDeleteRecipe()}
              loading={deleteRecipeMutation.isPending}
              disabled={isSubmitting}>
              Supprimer
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <Snackbar visible={Boolean(snackbarMessage)} onDismiss={() => setSnackbarMessage(null)} duration={4500}>
        {snackbarMessage}
      </Snackbar>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  offlineText: {
    opacity: 0.85,
  },
  pendingCard: {
    borderRadius: 14,
    elevation: 0,
  },
  pendingCardContent: {
    gap: 8,
  },
  centeredState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  errorText: {
    textAlign: 'center',
    color: DANGER_COLOR,
  },
  scrollContent: {
    gap: 12,
    paddingBottom: 24,
  },
  headerCard: {
    borderRadius: 18,
    elevation: 1,
  },
  headerCardContent: {
    gap: 4,
  },
  headerMetaText: {
    opacity: 0.8,
  },
  conflictCard: {
    borderRadius: 16,
    borderColor: WARNING_COLOR,
    elevation: 0,
  },
  conflictCardContent: {
    gap: 8,
  },
  conflictTitle: {
    color: DANGER_COLOR,
  },
  conflictHintText: {
    opacity: 0.9,
  },
  conflictListBlock: {
    gap: 4,
  },
  conflictListItem: {
    opacity: 0.9,
  },
  conflictActionsRow: {
    gap: 8,
  },
  ingredientsCard: {
    borderRadius: 16,
    elevation: 0,
  },
  ingredientsCardContent: {
    gap: 10,
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  ingredientIcon: {
    marginTop: 2,
  },
  ingredientTextBlock: {
    flex: 1,
    gap: 2,
  },
  ingredientMetaText: {
    opacity: 0.8,
  },
  ingredientStatusText: {
    fontWeight: '500',
  },
  emptyText: {
    opacity: 0.8,
  },
  actionsCard: {
    borderRadius: 18,
    elevation: 1,
  },
  actionsCardContent: {
    gap: 10,
  },
});

