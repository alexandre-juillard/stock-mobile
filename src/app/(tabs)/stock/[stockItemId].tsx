import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, ScrollView, View } from 'react-native';
import { Button, Card, Dialog, HelperText, Portal, Snackbar, Text, TextInput } from 'react-native-paper';

import { DangerButton } from '@/components/ui/danger-button';
import { MutedText } from '@/components/ui/muted-text';
import { ScreenShell } from '@/components/ui/screen-shell';
import { StateMessage } from '@/components/ui/state-message';
import { StockStatusBadge } from '@/components/ui/stock-status-badge';
import { buildStockFormRoute, STOCK_ROUTE } from '@/constants/routes';
import { radius, spacing } from '@/constants/theme';
import { makeStyles } from '@/hooks/use-app-theme';
import { useIsOffline } from '@/hooks/use-is-offline';
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
import { resolveApiAssetUri } from '@/services/api/http-client';
import { queryKeys } from '@/services/api/query-keys';
import { invalidateStockQueries } from '@/services/api/query-invalidations';
import { shouldQueueAfterError } from '@/services/offline/offline-queue';
import {
  enqueuePendingStockItemAction,
  flushPendingStockItemActions,
  getPendingStockItemActionsCount,
  type EnqueuePendingStockItemActionInput,
} from '@/services/offline/stock-item-actions-queue';
import { mapErrorToUi } from '@/utils/error-mapper';
import { formatDate, formatNumber, normalizeQuantity, parseDecimalInput } from '@/utils/format';
import { getFirstRouteParam } from '@/utils/route-params';

interface StockProductWithPhotoUrl {
  photoUrl?: string;
}

function formatNumberValue(value: number | undefined): string {
  return formatNumber(normalizeQuantity(value));
}

function formatDateValue(value: string | undefined): string {
  if (!value) {
    return 'Non renseignee';
  }

  return formatDate(value) ?? value;
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
    { queryKey: queryKeys.stock.listPrefix },
    (current) => updateQuantityInResponse(current, stockItemId, quantity)
  );

  queryClient.setQueriesData<ListExpiringSoonQueryResult>(
    { queryKey: queryKeys.stock.expiring },
    (current) => updateQuantityInResponse(current, stockItemId, quantity)
  );
}

function applyOptimisticRemoval(queryClient: QueryClient, stockItemId: string): void {
  queryClient.setQueriesData<ListStockItemsQueryResult>(
    { queryKey: queryKeys.stock.listPrefix },
    (current) => removeItemFromResponse(current, stockItemId)
  );

  queryClient.setQueriesData<ListExpiringSoonQueryResult>(
    { queryKey: queryKeys.stock.expiring },
    (current) => removeItemFromResponse(current, stockItemId)
  );
}

export default function StockItemDetailScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isOffline = useIsOffline();
  const styles = useStyles();

  const { stockItemId: stockItemIdParam } =
    useLocalSearchParams<{ stockItemId?: string | string[] }>();
  const stockItemId = useMemo(() => getFirstRouteParam(stockItemIdParam), [stockItemIdParam]);

  const [quantityDraft, setQuantityDraft] = useState('');
  const [quantityFieldError, setQuantityFieldError] = useState<string | null>(null);
  const [isQuantityDialogVisible, setIsQuantityDialogVisible] = useState(false);
  const [isConsumeDialogVisible, setIsConsumeDialogVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);

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
  const photoUri = photoUrl ? resolveApiAssetUri(photoUrl) : null;

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

    const parsedQuantity = parseDecimalInput(quantityDraft);
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
      if (shouldQueueAfterError(error)) {
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
      if (shouldQueueAfterError(error)) {
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
      if (shouldQueueAfterError(error)) {
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
        <StateMessage tone="error" icon="alert-circle-outline" message="Identifiant du produit manquant.">
          <Button mode="outlined" onPress={() => router.replace(STOCK_ROUTE)}>
            Retour au stock
          </Button>
        </StateMessage>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      title="Detail produit"
      subtitle="Consulte les infos de ton produit et gere les actions rapides, meme hors ligne.">
      {isOffline ? (
        <MutedText>Tu es hors ligne: tes actions sont appliquees localement puis synchronisees ensuite.</MutedText>
      ) : null}

      {pendingActionsCount > 0 ? (
        <MutedText>{pendingActionsCount} action(s) en attente de synchronisation pour ce produit.</MutedText>
      ) : null}

      {stockItemsQuery.isLoading ? (
        <StateMessage message="Chargement du produit..." />
      ) : stockItemsQuery.isError ? (
        <StateMessage tone="error" icon="alert-circle-outline" message={mapErrorToUi(stockItemsQuery.error).message}>
          {!isOffline ? (
            <Button mode="outlined" onPress={() => void handleRefresh()}>
              Reessayer
            </Button>
          ) : null}
        </StateMessage>
      ) : !stockItem ? (
        <StateMessage icon="fridge-off-outline" message="Ce produit n'est plus present dans ton stock.">
          <Button mode="outlined" onPress={() => router.replace(STOCK_ROUTE)}>
            Retour au stock
          </Button>
        </StateMessage>
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
              <MutedText variant="bodyMedium">{categoryLabel}</MutedText>
            </Card.Content>
          </Card>

          <Card mode="outlined" style={styles.outlinedCard}>
            <Card.Content style={styles.infoContent}>
              <View style={styles.infoRow}>
                <MutedText variant="labelLarge">Quantite</MutedText>
                <Text variant="bodyLarge" style={styles.infoValue}>
                  {quantityLabel}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <MutedText variant="labelLarge">Seuil bas</MutedText>
                <Text variant="bodyLarge" style={styles.infoValue}>
                  {thresholdLabel}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <MutedText variant="labelLarge">Expiration</MutedText>
                <Text variant="bodyLarge" style={styles.infoValue}>
                  {expirationLabel}
                </Text>
              </View>
            </Card.Content>
          </Card>

          <Card mode="outlined" style={styles.outlinedCard}>
            <Card.Content style={styles.photoContent}>
              <MutedText variant="labelLarge">Photo</MutedText>
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={styles.photo} resizeMode="cover" />
              ) : (
                <View style={styles.photoPlaceholder}>
                  <MaterialCommunityIcons name="image-off-outline" size={28} style={styles.placeholderIcon} />
                  <Text variant="bodyMedium" style={styles.centeredText}>
                    Aucune photo disponible
                  </Text>
                  <MutedText variant="labelSmall" style={styles.centeredText}>
                    Tu pourras en ajouter une dans l&apos;ecran d&apos;edition.
                  </MutedText>
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

              <DangerButton
                mode="contained"
                icon="check-circle-outline"
                onPress={() => setIsConsumeDialogVisible(true)}
                disabled={isActionPending}>
                Marquer consomme
              </DangerButton>

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
            <HelperText type="error" visible={Boolean(quantityFieldError)}>
              {quantityFieldError}
            </HelperText>
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
            <DangerButton onPress={() => void handleConsume()} loading={deleteStockItemMutation.isPending}>
              Confirmer
            </DangerButton>
          </Dialog.Actions>
        </Dialog>
      </Portal>
      <Snackbar visible={Boolean(snackbarMessage)} onDismiss={() => setSnackbarMessage(null)} duration={4500}>
        {snackbarMessage}
      </Snackbar>
    </ScreenShell>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  scrollContent: {
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  headerCard: {
    borderRadius: radius.cardLarge,
  },
  headerCardContent: {
    gap: spacing.xs + 2,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  productName: {
    flex: 1,
  },
  outlinedCard: {
    borderRadius: radius.card,
    borderColor: colors.outlineVariant,
  },
  infoContent: {
    gap: spacing.sm + 2,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  infoValue: {
    flexShrink: 1,
    textAlign: 'right',
  },
  photoContent: {
    gap: spacing.sm + 2,
  },
  photo: {
    width: '100%',
    height: 180,
    borderRadius: radius.card,
    backgroundColor: colors.surfaceVariant,
  },
  photoPlaceholder: {
    height: 160,
    borderRadius: radius.card,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.outline,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.md,
  },
  placeholderIcon: {
    color: colors.onSurfaceVariant,
  },
  centeredText: {
    textAlign: 'center',
  },
  actionsCard: {
    borderRadius: radius.cardLarge,
  },
  actionsContent: {
    gap: spacing.sm + 2,
  },
  dialogContent: {
    gap: spacing.xs,
  },
  // Fond identique ? celui du Dialog pour que l'encoche du libell? reste invisible.
  dialogInput: {
    backgroundColor: colors.elevation.level3,
  },
}));
