import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNetInfo } from '@react-native-community/netinfo';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, Dialog, Portal, Snackbar, Text, TextInput } from 'react-native-paper';

import { ScreenShell } from '@/components/ui/screen-shell';
import { StockStatusBadge } from '@/components/ui/stock-status-badge';
import type { StockItemResponse } from '@/services/api/generated/model';
import type {
  ListExpiringSoonQueryResult,
  ListStockItemsQueryResult,
} from '@/services/api/generated/stock/stock';
import {
  useAddToShoppingList,
  useDeleteStockItem,
  useListStockItems,
  useUpdateQuantity,
} from '@/services/api/generated/stock/stock';
import { ApiClientError } from '@/services/api/http-client';
import {
  enqueuePendingStockItemAction,
  flushPendingStockItemActions,
  getPendingStockItemActionsCount,
  type EnqueuePendingStockItemActionInput,
} from '@/services/offline/stock-item-actions-queue';
import { mapErrorToUi } from '@/utils/error-mapper';

const STOCK_ROUTE = '/(tabs)/stock' as Href;
const STOCK_FORM_PATH = '/(tabs)/stock/form';

const STOCK_LIST_QUERY_KEY_PREFIX = ['/api/stock-items'] as const;
const STOCK_EXPIRING_QUERY_KEY = ['/api/stock-items/expiring-soon'] as const;

const OUTLINED_BORDER_COLOR = '#D8DBE2';
const DANGER_COLOR = '#D90429';

interface StockProductWithPhotoUrl {
  photoUrl?: string;
}

function getFirstRouteParamValue(param: string | string[] | undefined): string | null {
  if (!param) {
    return null;
  }

  return Array.isArray(param) ? (param[0] ?? null) : param;
}

function formatNumberValue(value: number | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '0';
  }

  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(value);
}

function formatDateValue(value: string | undefined): string {
  if (!value) {
    return 'Non renseignee';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

function normalizeApiBaseUrl(baseUrl: string | undefined): string {
  if (!baseUrl) {
    return '';
  }

  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
}

function resolvePhotoUri(photoUrl: string): string {
  if (photoUrl.startsWith('http://') || photoUrl.startsWith('https://')) {
    return photoUrl;
  }

  const normalizedBaseUrl = normalizeApiBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL);
  if (!normalizedBaseUrl) {
    return photoUrl;
  }

  const normalizedPath = photoUrl.startsWith('/') ? photoUrl : `/${photoUrl}`;
  return `${normalizedBaseUrl}${normalizedPath}`;
}

function shouldQueueActionAfterError(error: unknown): boolean {
  return !(error instanceof ApiClientError && error.status >= 400 && error.status < 500);
}

function buildStockFormRoute(stockItemId: string): Href {
  const encodedStockItemId = encodeURIComponent(stockItemId);
  return `${STOCK_FORM_PATH}?stockItemId=${encodedStockItemId}` as Href;
}

function updateQuantityInResponse<T extends { data: StockItemResponse[] }>(
  response: T | undefined,
  stockItemId: string,
  quantity: number
): T | undefined {
  if (!response) {
    return response;
  }

  let hasUpdated = false;
  const nextItems = response.data.map((item) => {
    if (item.id !== stockItemId) {
      return item;
    }

    if (item.quantity === quantity) {
      return item;
    }

    hasUpdated = true;
    return {
      ...item,
      quantity,
    };
  });

  if (!hasUpdated) {
    return response;
  }

  return {
    ...response,
    data: nextItems,
  };
}

function removeItemFromResponse<T extends { data: StockItemResponse[] }>(
  response: T | undefined,
  stockItemId: string
): T | undefined {
  if (!response) {
    return response;
  }

  const nextItems = response.data.filter((item) => item.id !== stockItemId);
  if (nextItems.length === response.data.length) {
    return response;
  }

  return {
    ...response,
    data: nextItems,
  };
}

function applyOptimisticQuantityUpdate(
  queryClient: QueryClient,
  stockItemId: string,
  quantity: number
): void {
  queryClient.setQueriesData<ListStockItemsQueryResult>(
    { queryKey: STOCK_LIST_QUERY_KEY_PREFIX },
    (current) => updateQuantityInResponse(current, stockItemId, quantity)
  );

  queryClient.setQueriesData<ListExpiringSoonQueryResult>(
    { queryKey: STOCK_EXPIRING_QUERY_KEY },
    (current) => updateQuantityInResponse(current, stockItemId, quantity)
  );
}

function applyOptimisticRemoval(queryClient: QueryClient, stockItemId: string): void {
  queryClient.setQueriesData<ListStockItemsQueryResult>(
    { queryKey: STOCK_LIST_QUERY_KEY_PREFIX },
    (current) => removeItemFromResponse(current, stockItemId)
  );

  queryClient.setQueriesData<ListExpiringSoonQueryResult>(
    { queryKey: STOCK_EXPIRING_QUERY_KEY },
    (current) => removeItemFromResponse(current, stockItemId)
  );
}

async function invalidateStockQueries(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: STOCK_LIST_QUERY_KEY_PREFIX }),
    queryClient.invalidateQueries({ queryKey: STOCK_EXPIRING_QUERY_KEY }),
  ]);
}

export default function StockItemDetailScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const netInfo = useNetInfo();

  const { stockItemId: stockItemIdParam } =
    useLocalSearchParams<{ stockItemId?: string | string[] }>();
  const stockItemId = useMemo(() => getFirstRouteParamValue(stockItemIdParam), [stockItemIdParam]);

  const [quantityDraft, setQuantityDraft] = useState('');
  const [quantityFieldError, setQuantityFieldError] = useState<string | null>(null);
  const [isQuantityDialogVisible, setIsQuantityDialogVisible] = useState(false);
  const [isConsumeDialogVisible, setIsConsumeDialogVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);

  const isOffline = netInfo.isConnected === false || netInfo.isInternetReachable === false;

  const stockItemsQuery = useListStockItems();
  const {
    data: pendingActionsCount = 0,
    refetch: refreshPendingActionsCount,
  } = useQuery({
    queryKey: ['offline-stock-item-actions-count', stockItemId ?? 'all'],
    queryFn: () => getPendingStockItemActionsCount(stockItemId ?? undefined),
    enabled: Boolean(stockItemId),
  });
  const updateQuantityMutation = useUpdateQuantity();
  const addToShoppingListMutation = useAddToShoppingList();
  const deleteStockItemMutation = useDeleteStockItem();

  const isActionPending =
    updateQuantityMutation.isPending ||
    addToShoppingListMutation.isPending ||
    deleteStockItemMutation.isPending;

  const stockItem = useMemo(() => {
    if (!stockItemId) {
      return null;
    }

    return (stockItemsQuery.data?.data ?? []).find((item) => item.id === stockItemId) ?? null;
  }, [stockItemId, stockItemsQuery.data]);

  const productName = stockItem?.product?.name ?? 'Produit sans nom';
  const unitLabel = stockItem?.product?.baseUnit?.label ?? stockItem?.product?.baseUnit?.code ?? '';
  const quantityLabel = `${formatNumberValue(stockItem?.quantity)}${unitLabel ? ` ${unitLabel}` : ''}`;
  const thresholdLabel =
    typeof stockItem?.lowThreshold === 'number'
      ? `${formatNumberValue(stockItem.lowThreshold)}${unitLabel ? ` ${unitLabel}` : ''}`
      : 'Non defini';
  const expirationLabel = formatDateValue(stockItem?.expirationDate);
  const categoryLabel = stockItem?.product?.category?.name ?? 'Sans categorie';

  const photoUrl = (stockItem?.product as StockProductWithPhotoUrl | undefined)?.photoUrl;
  const photoUri = photoUrl ? resolvePhotoUri(photoUrl) : null;

  const enqueueAction = useCallback(
    async (action: EnqueuePendingStockItemActionInput, message: string) => {
      await enqueuePendingStockItemAction(action);
      await refreshPendingActionsCount();
      setSnackbarMessage(message);
    },
    [refreshPendingActionsCount]
  );

  const isFlushingQueueRef = useRef(false);

  const flushOfflineActions = useCallback(async () => {
    if (isOffline || isFlushingQueueRef.current || isActionPending) {
      return;
    }

    isFlushingQueueRef.current = true;

    try {
      const result = await flushPendingStockItemActions({
        updateQuantity: async (queuedStockItemId, payload) => {
          await updateQuantityMutation.mutateAsync({
            id: queuedStockItemId,
            data: { quantity: payload.quantity },
          });
        },
        addToShoppingList: async (queuedStockItemId) => {
          await addToShoppingListMutation.mutateAsync({ id: queuedStockItemId });
        },
        consume: async (queuedStockItemId) => {
          await deleteStockItemMutation.mutateAsync({ id: queuedStockItemId });
        },
      });

      if (result.syncedCount > 0) {
        await invalidateStockQueries(queryClient);
      }

      if (result.status === 'synced' && result.syncedCount > 0) {
        setSnackbarMessage(`${result.syncedCount} action(s) hors ligne synchronisee(s).`);
      }

      if (result.status === 'retry_later' && result.retryCount > 0) {
        setSnackbarMessage(
          `${result.syncedCount} action(s) synchronisee(s), ${result.retryCount} encore en attente.`
        );
      }

      if (result.status === 'failed' && result.failedCount > 0) {
        setSnackbarMessage(`${result.failedCount} action(s) n'ont pas pu etre rejouee(s).`);
      }

      await refreshPendingActionsCount();
    } finally {
      isFlushingQueueRef.current = false;
    }
  }, [
    addToShoppingListMutation,
    deleteStockItemMutation,
    isActionPending,
    isOffline,
    queryClient,
    refreshPendingActionsCount,
    updateQuantityMutation,
  ]);

  useEffect(() => {
    void flushOfflineActions();
  }, [flushOfflineActions]);

  const handleRefresh = useCallback(async () => {
    await stockItemsQuery.refetch();
    await refreshPendingActionsCount();
  }, [refreshPendingActionsCount, stockItemsQuery]);

  const handleOpenQuantityDialog = useCallback(() => {
    if (!stockItem) {
      return;
    }

    setQuantityFieldError(null);
    setQuantityDraft(
      typeof stockItem.quantity === 'number' && !Number.isNaN(stockItem.quantity)
        ? String(stockItem.quantity)
        : '0'
    );
    setIsQuantityDialogVisible(true);
  }, [stockItem]);

  const handleSaveQuantity = useCallback(async () => {
    if (!stockItemId) {
      return;
    }

    const parsedQuantity = Number.parseFloat(quantityDraft.replace(',', '.'));
    if (!Number.isFinite(parsedQuantity) || parsedQuantity < 0) {
      setQuantityFieldError('Renseigne une quantite valide (>= 0).');
      return;
    }

    setIsQuantityDialogVisible(false);
    applyOptimisticQuantityUpdate(queryClient, stockItemId, parsedQuantity);

    const pendingAction: EnqueuePendingStockItemActionInput = {
      type: 'update_quantity',
      stockItemId,
      payload: { quantity: parsedQuantity },
    };

    if (isOffline) {
      await enqueueAction(
        pendingAction,
        'Quantite mise a jour hors ligne. Synchronisation des que la connexion revient.'
      );
      return;
    }

    try {
      await updateQuantityMutation.mutateAsync({
        id: stockItemId,
        data: { quantity: parsedQuantity },
      });
      await invalidateStockQueries(queryClient);
      setSnackbarMessage('Quantite mise a jour.');
    } catch (error) {
      if (shouldQueueActionAfterError(error)) {
        await enqueueAction(
          pendingAction,
          'Reseau instable: mise a jour enregistree hors ligne et en attente de synchronisation.'
        );
        return;
      }

      await invalidateStockQueries(queryClient);
      setSnackbarMessage(mapErrorToUi(error).message);
    }
  }, [enqueueAction, isOffline, queryClient, quantityDraft, stockItemId, updateQuantityMutation]);

  const handleAddToShoppingList = useCallback(async () => {
    if (!stockItemId) {
      return;
    }

    const pendingAction: EnqueuePendingStockItemActionInput = {
      type: 'add_to_shopping_list',
      stockItemId,
    };

    if (isOffline) {
      await enqueueAction(
        pendingAction,
        'Ajout aux courses enregistre hors ligne. Synchronisation des que possible.'
      );
      return;
    }

    try {
      await addToShoppingListMutation.mutateAsync({ id: stockItemId });
      setSnackbarMessage('Produit ajoute a la liste de courses.');
    } catch (error) {
      if (shouldQueueActionAfterError(error)) {
        await enqueueAction(
          pendingAction,
          'Reseau instable: ajout aux courses place en file hors ligne.'
        );
        return;
      }

      setSnackbarMessage(mapErrorToUi(error).message);
    }
  }, [addToShoppingListMutation, enqueueAction, isOffline, stockItemId]);

  const handleConsume = useCallback(async () => {
    if (!stockItemId) {
      return;
    }

    setIsConsumeDialogVisible(false);
    applyOptimisticRemoval(queryClient, stockItemId);

    const pendingAction: EnqueuePendingStockItemActionInput = {
      type: 'consume',
      stockItemId,
    };

    if (isOffline) {
      await enqueueAction(
        pendingAction,
        'Produit retire hors ligne. Synchronisation des que la connexion revient.'
      );
      router.replace(STOCK_ROUTE);
      return;
    }

    try {
      await deleteStockItemMutation.mutateAsync({ id: stockItemId });
      await invalidateStockQueries(queryClient);
      router.replace(STOCK_ROUTE);
    } catch (error) {
      if (shouldQueueActionAfterError(error)) {
        await enqueueAction(
          pendingAction,
          'Reseau instable: suppression enregistree hors ligne puis synchronisee plus tard.'
        );
        router.replace(STOCK_ROUTE);
        return;
      }

      await invalidateStockQueries(queryClient);
      setSnackbarMessage(mapErrorToUi(error).message);
    }
  }, [deleteStockItemMutation, enqueueAction, isOffline, queryClient, router, stockItemId]);

  const handleOpenEditForm = useCallback(() => {
    if (!stockItemId) {
      return;
    }

    router.push(buildStockFormRoute(stockItemId));
  }, [router, stockItemId]);

  if (!stockItemId) {
    return (
      <ScreenShell title="Detail produit">
        <View style={styles.centeredState}>
          <MaterialCommunityIcons name="alert-circle-outline" size={32} color={DANGER_COLOR} />
          <Text style={styles.errorText}>Identifiant du produit manquant.</Text>
          <Button mode="outlined" onPress={() => router.replace(STOCK_ROUTE)}>
            Retour au stock
          </Button>
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      title="Detail produit"
      subtitle="Consulte les infos de ton produit et gere les actions rapides, meme hors ligne.">
      {isOffline ? (
        <Text style={styles.offlineText}>
          Tu es hors ligne: tes actions sont appliquees localement puis synchronisees ensuite.
        </Text>
      ) : null}

      {pendingActionsCount > 0 ? (
        <Text style={styles.pendingText}>
          {pendingActionsCount} action(s) en attente de synchronisation pour ce produit.
        </Text>
      ) : null}

      {stockItemsQuery.isLoading ? (
        <View style={styles.centeredState}>
          <Text>Chargement du produit...</Text>
        </View>
      ) : stockItemsQuery.isError ? (
        <View style={styles.centeredState}>
          <MaterialCommunityIcons name="alert-circle-outline" size={32} color={DANGER_COLOR} />
          <Text style={styles.errorText}>{mapErrorToUi(stockItemsQuery.error).message}</Text>
          {!isOffline ? (
            <Button mode="outlined" onPress={() => void handleRefresh()}>
              Reessayer
            </Button>
          ) : null}
        </View>
      ) : !stockItem ? (
        <View style={styles.centeredState}>
          <MaterialCommunityIcons name="fridge-off-outline" size={32} color="#60646C" />
          <Text style={styles.emptyText}>Ce produit n&apos;est plus present dans ton stock.</Text>
          <Button mode="outlined" onPress={() => router.replace(STOCK_ROUTE)}>
            Retour au stock
          </Button>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Card style={styles.headerCard}>
            <Card.Content style={styles.headerCardContent}>
              <View style={styles.headerTitleRow}>
                <Text variant="titleLarge" style={styles.productName}>
                  {productName}
                </Text>
                {stockItem.status ? <StockStatusBadge status={stockItem.status} /> : null}
              </View>
              <Text variant="bodyMedium" style={styles.subtitleText}>
                {categoryLabel}
              </Text>
            </Card.Content>
          </Card>

          <Card mode="outlined" style={styles.infoCard}>
            <Card.Content style={styles.infoContent}>
              <View style={styles.infoRow}>
                <Text variant="labelLarge" style={styles.infoLabel}>
                  Quantite
                </Text>
                <Text variant="bodyLarge" style={styles.infoValue}>
                  {quantityLabel}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text variant="labelLarge" style={styles.infoLabel}>
                  Seuil bas
                </Text>
                <Text variant="bodyLarge" style={styles.infoValue}>
                  {thresholdLabel}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text variant="labelLarge" style={styles.infoLabel}>
                  Expiration
                </Text>
                <Text variant="bodyLarge" style={styles.infoValue}>
                  {expirationLabel}
                </Text>
              </View>
            </Card.Content>
          </Card>

          <Card mode="outlined" style={styles.photoCard}>
            <Card.Content style={styles.photoContent}>
              <Text variant="labelLarge" style={styles.infoLabel}>
                Photo
              </Text>
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={styles.photo} resizeMode="cover" />
              ) : (
                <View style={styles.photoPlaceholder}>
                  <MaterialCommunityIcons name="image-off-outline" size={28} color="#60646C" />
                  <Text variant="bodyMedium" style={styles.photoPlaceholderText}>
                    Aucune photo disponible
                  </Text>
                  <Text variant="labelSmall" style={styles.photoPlaceholderHint}>
                    Tu pourras en ajouter une dans l&apos;ecran d&apos;edition.
                  </Text>
                </View>
              )}
            </Card.Content>
          </Card>

          <Card style={styles.actionsCard}>
            <Card.Content style={styles.actionsContent}>
              <Button
                mode="contained-tonal"
                icon="scale"
                onPress={handleOpenQuantityDialog}
                disabled={isActionPending}>
                Modifier la quantite
              </Button>

              <Button
                mode="outlined"
                icon="cart-plus"
                onPress={() => void handleAddToShoppingList()}
                disabled={isActionPending}>
                Ajouter aux courses
              </Button>

              <Button mode="outlined" icon="pencil" onPress={handleOpenEditForm} disabled={isActionPending}>
                Editer le produit
              </Button>

              <Button
                mode="contained"
                icon="check-circle-outline"
                buttonColor={DANGER_COLOR}
                textColor="#FFFFFF"
                onPress={() => setIsConsumeDialogVisible(true)}
                disabled={isActionPending}>
                Marquer consomme
              </Button>

              {!isOffline ? (
                <Button
                  mode="text"
                  icon="refresh"
                  loading={stockItemsQuery.isFetching}
                  onPress={() => void handleRefresh()}>
                  Rafraichir
                </Button>
              ) : null}
            </Card.Content>
          </Card>
        </ScrollView>
      )}
      <Portal>
        <Dialog visible={isQuantityDialogVisible} onDismiss={() => setIsQuantityDialogVisible(false)}>
          <Dialog.Title>Modifier la quantite</Dialog.Title>
          <Dialog.Content style={styles.dialogContent}>
            <TextInput
              mode="outlined"
              label={unitLabel ? `Quantite (${unitLabel})` : 'Quantite'}
              value={quantityDraft}
              onChangeText={setQuantityDraft}
              keyboardType="decimal-pad"
              error={Boolean(quantityFieldError)}
              style={styles.dialogInput}
            />
            {quantityFieldError ? <Text style={styles.dialogErrorText}>{quantityFieldError}</Text> : null}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setIsQuantityDialogVisible(false)}>Annuler</Button>
            <Button
              onPress={() => void handleSaveQuantity()}
              loading={updateQuantityMutation.isPending}>
              Enregistrer
            </Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={isConsumeDialogVisible} onDismiss={() => setIsConsumeDialogVisible(false)}>
          <Dialog.Title>Retirer ce produit du stock ?</Dialog.Title>
          <Dialog.Content>
            <Text>
              Cette action retire l&apos;article de ton stock actuel. Tu pourras le re-ajouter plus tard si
              besoin.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setIsConsumeDialogVisible(false)}>Annuler</Button>
            <Button
              textColor={DANGER_COLOR}
              onPress={() => void handleConsume()}
              loading={deleteStockItemMutation.isPending}>
              Confirmer
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
  pendingText: {
    opacity: 0.85,
  },
  centeredState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  errorText: {
    color: DANGER_COLOR,
    textAlign: 'center',
  },
  emptyText: {
    textAlign: 'center',
    opacity: 0.8,
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
    gap: 6,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  productName: {
    flex: 1,
  },
  subtitleText: {
    opacity: 0.8,
  },
  infoCard: {
    borderRadius: 16,
    borderColor: OUTLINED_BORDER_COLOR,
    elevation: 0,
  },
  infoContent: {
    gap: 10,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  infoLabel: {
    opacity: 0.8,
  },
  infoValue: {
    flexShrink: 1,
    textAlign: 'right',
  },
  photoCard: {
    borderRadius: 16,
    borderColor: OUTLINED_BORDER_COLOR,
    elevation: 0,
  },
  photoContent: {
    gap: 10,
  },
  photo: {
    width: '100%',
    height: 180,
    borderRadius: 14,
    backgroundColor: '#E8ECEA',
  },
  photoPlaceholder: {
    height: 160,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: OUTLINED_BORDER_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
  },
  photoPlaceholderText: {
    textAlign: 'center',
  },
  photoPlaceholderHint: {
    textAlign: 'center',
    opacity: 0.7,
  },
  actionsCard: {
    borderRadius: 18,
    elevation: 1,
  },
  actionsContent: {
    gap: 10,
  },
  dialogContent: {
    gap: 8,
  },
  dialogInput: {
    backgroundColor: 'transparent',
  },
  dialogErrorText: {
    color: DANGER_COLOR,
  },
});
