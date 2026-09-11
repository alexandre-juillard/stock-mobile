import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNetInfo } from '@react-native-community/netinfo';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import {
  Button,
  Card,
  Chip,
  Dialog,
  FAB,
  HelperText,
  Portal,
  Snackbar,
  Text,
  TextInput,
} from 'react-native-paper';

import { ScreenShell } from '@/components/ui/screen-shell';
import {
  addShoppingListItem,
  checkShoppingListItem,
  checkThresholds,
  clearShoppingList,
  deleteShoppingListItem,
  finishShoppingList,
  uncheckShoppingListItem,
  useListShoppingList,
  type ListShoppingListQueryResult,
} from '@/services/api/generated/liste-de-courses/liste-de-courses';
import type {
  ProductResponse,
  ShoppingListCategoryGroupResponse,
  ShoppingListItemResponse,
} from '@/services/api/generated/model';
import { useListProducts } from '@/services/api/generated/produits/produits';
import { useGetUnitsByType } from '@/services/api/generated/référentiel-quantités/référentiel-quantités';
import { ApiClientError } from '@/services/api/http-client';
import { queryKeys } from '@/services/api/query-keys';
import { invalidateShoppingListQueries } from '@/services/api/query-invalidations';
import {
  enqueuePendingShoppingListAction,
  flushPendingShoppingListActions,
  getPendingShoppingListActionsCount,
  type EnqueuePendingShoppingListActionInput,
} from '@/services/offline/shopping-list-actions-queue';
import { mapErrorToUi } from '@/utils/error-mapper';

const TEMP_ITEM_ID_PREFIX = 'offline-shopping-item-';
const DANGER_COLOR = '#D90429';

interface AddItemDialogState {
  productId: string;
  searchQuery: string;
  errorMessage: string | null;
}

interface CheckItemDialogState {
  itemId: string;
  productId: string;
  quantity: string;
  unitId: string;
  unitLabel: string;
  errorMessage: string | null;
}

interface UnitOption {
  id: string;
  label: string;
}

function parseQuantityInput(value: string): number {
  return Number.parseFloat(value.replace(',', '.'));
}

function formatQuantity(value: number | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '0';
  }

  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(value);
}

function isOptimisticItem(itemId: string | undefined): boolean {
  return Boolean(itemId && itemId.startsWith(TEMP_ITEM_ID_PREFIX));
}

function shouldQueueAfterError(error: unknown): boolean {
  return !(error instanceof ApiClientError && error.status >= 400 && error.status < 500);
}

function toUnitOptions(
  product: ProductResponse | null,
  apiUnits: { id?: string; label?: string; code?: string }[] | undefined
): UnitOption[] {
  if (apiUnits && apiUnits.length > 0) {
    return apiUnits
      .filter((unit) => Boolean(unit.id))
      .map((unit) => ({
        id: unit.id!,
        label: unit.label ?? unit.code ?? unit.id!,
      }));
  }

  const baseUnitId = product?.baseUnit?.id;
  if (!baseUnitId) {
    return [];
  }

  return [
    {
      id: baseUnitId,
      label: product?.baseUnit?.label ?? product?.baseUnit?.code ?? baseUnitId,
    },
  ];
}

function updateShoppingListResponse(
  response: ListShoppingListQueryResult | undefined,
  updater: (groups: ShoppingListCategoryGroupResponse[]) => ShoppingListCategoryGroupResponse[]
): ListShoppingListQueryResult | undefined {
  if (!response) {
    return response;
  }

  return {
    ...response,
    data: updater(response.data ?? []),
  };
}

function removeEmptyGroups(groups: ShoppingListCategoryGroupResponse[]): ShoppingListCategoryGroupResponse[] {
  return groups.filter((group) => (group.items?.length ?? 0) > 0);
}

function createOptimisticItem(product: ProductResponse): ShoppingListItemResponse {
  return {
    id: `${TEMP_ITEM_ID_PREFIX}${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    product: {
      id: product.id,
      name: product.name,
    },
    isChecked: false,
    addedAutomatically: false,
    addedAt: new Date().toISOString(),
  };
}

function applyOptimisticAdd(
  queryClient: QueryClient,
  product: ProductResponse
): void {
  const nextItem = createOptimisticItem(product);
  const categoryName = product.category?.name ?? 'Sans categorie';
  const categoryColor = product.category?.color ?? '#D8DBE2';

  queryClient.setQueriesData<ListShoppingListQueryResult>(
    { queryKey: queryKeys.shoppingList.list },
    (currentResponse) =>
      updateShoppingListResponse(currentResponse, (groups) => {
        let hasCategory = false;

        const nextGroups = groups.map((group) => {
          const groupName = group.category?.name ?? 'Sans categorie';
          if (groupName !== categoryName) {
            return group;
          }

          hasCategory = true;
          return {
            ...group,
            items: [...(group.items ?? []), nextItem],
          };
        });

        if (hasCategory) {
          return nextGroups;
        }

        return [
          ...nextGroups,
          {
            category: {
              name: categoryName,
              color: categoryColor,
            },
            items: [nextItem],
          },
        ];
      })
  );
}

function applyOptimisticCheck(
  queryClient: QueryClient,
  itemId: string,
  checkedQuantity: number,
  checkedUnitId: string,
  checkedUnitLabel: string
): void {
  queryClient.setQueriesData<ListShoppingListQueryResult>(
    { queryKey: queryKeys.shoppingList.list },
    (currentResponse) =>
      updateShoppingListResponse(currentResponse, (groups) =>
        groups.map((group) => ({
          ...group,
          items: (group.items ?? []).map((item) => {
            if (item.id !== itemId) {
              return item;
            }

            return {
              ...item,
              isChecked: true,
              checkedQuantity,
              checkedUnit: {
                id: checkedUnitId,
                label: checkedUnitLabel,
                code: checkedUnitLabel,
              },
              checkedAt: new Date().toISOString(),
            };
          }),
        }))
      )
  );
}

function applyOptimisticUncheck(queryClient: QueryClient, itemId: string): void {
  queryClient.setQueriesData<ListShoppingListQueryResult>(
    { queryKey: queryKeys.shoppingList.list },
    (currentResponse) =>
      updateShoppingListResponse(currentResponse, (groups) =>
        groups.map((group) => ({
          ...group,
          items: (group.items ?? []).map((item) => {
            if (item.id !== itemId) {
              return item;
            }

            return {
              ...item,
              isChecked: false,
              checkedQuantity: undefined,
              checkedUnit: undefined,
              checkedAt: undefined,
            };
          }),
        }))
      )
  );
}

function applyOptimisticDelete(queryClient: QueryClient, itemId: string): void {
  queryClient.setQueriesData<ListShoppingListQueryResult>(
    { queryKey: queryKeys.shoppingList.list },
    (currentResponse) =>
      updateShoppingListResponse(currentResponse, (groups) =>
        removeEmptyGroups(
          groups.map((group) => ({
            ...group,
            items: (group.items ?? []).filter((item) => item.id !== itemId),
          }))
        )
      )
  );
}

function applyOptimisticClear(queryClient: QueryClient): void {
  queryClient.setQueriesData<ListShoppingListQueryResult>(
    { queryKey: queryKeys.shoppingList.list },
    (currentResponse) => updateShoppingListResponse(currentResponse, () => [])
  );
}

function applyOptimisticFinish(queryClient: QueryClient): void {
  queryClient.setQueriesData<ListShoppingListQueryResult>(
    { queryKey: queryKeys.shoppingList.list },
    (currentResponse) =>
      updateShoppingListResponse(currentResponse, (groups) =>
        removeEmptyGroups(
          groups.map((group) => ({
            ...group,
            items: (group.items ?? []).filter((item) => item.isChecked !== true),
          }))
        )
      )
  );
}


export default function ShoppingListScreen() {
  const queryClient = useQueryClient();
  const netInfo = useNetInfo();

  const [addItemDialog, setAddItemDialog] = useState<AddItemDialogState | null>(null);
  const [checkItemDialog, setCheckItemDialog] = useState<CheckItemDialogState | null>(null);
  const [isClearDialogVisible, setIsClearDialogVisible] = useState(false);
  const [isFinishDialogVisible, setIsFinishDialogVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);
  const [isSyncingQueue, setIsSyncingQueue] = useState(false);

  const isOffline = netInfo.isConnected === false || netInfo.isInternetReachable === false;

  const shoppingListQuery = useListShoppingList();
  const productsQuery = useListProducts();

  const {
    data: pendingActionsCount = 0,
    refetch: refreshPendingActionsCount,
  } = useQuery({
    queryKey: ['offline-shopping-list-actions-count'],
    queryFn: getPendingShoppingListActionsCount,
  });

  const products = useMemo(() => productsQuery.data?.data ?? [], [productsQuery.data]);

  const productsById = useMemo(() => {
    const productMap = new Map<string, ProductResponse>();

    for (const product of products) {
      if (!product.id) {
        continue;
      }

      productMap.set(product.id, product);
    }

    return productMap;
  }, [products]);

  const shoppingGroups = useMemo(() => shoppingListQuery.data?.data ?? [], [shoppingListQuery.data]);

  const allShoppingItems = useMemo(() => {
    const items: ShoppingListItemResponse[] = [];

    for (const group of shoppingGroups) {
      items.push(...(group.items ?? []));
    }

    return items;
  }, [shoppingGroups]);

  const existingProductIds = useMemo(() => {
    const productIds = new Set<string>();

    for (const item of allShoppingItems) {
      const productId = item.product?.id;
      if (productId) {
        productIds.add(productId);
      }
    }

    return productIds;
  }, [allShoppingItems]);

  const selectedCheckDialogProduct = checkItemDialog?.productId
    ? productsById.get(checkItemDialog.productId) ?? null
    : null;

  const checkDialogQuantityTypeId = selectedCheckDialogProduct?.quantityType?.id ?? '';

  const checkDialogUnitsQuery = useGetUnitsByType(checkDialogQuantityTypeId, {
    query: {
      enabled: Boolean(checkItemDialog) && Boolean(checkDialogQuantityTypeId),
    },
  });

  const checkDialogUnitOptions = useMemo(() => {
    return toUnitOptions(selectedCheckDialogProduct, checkDialogUnitsQuery.data?.data);
  }, [checkDialogUnitsQuery.data, selectedCheckDialogProduct]);

  const addDialogAvailableProducts = useMemo(() => {
    if (!addItemDialog) {
      return [];
    }

    const normalizedSearchQuery = addItemDialog.searchQuery.trim().toLowerCase();

    return products
      .filter((product) => Boolean(product.id) && Boolean(product.name))
      .filter((product) => product.isVisible !== false)
      .filter((product) => !existingProductIds.has(product.id!))
      .filter((product) =>
        normalizedSearchQuery ? (product.name ?? '').toLowerCase().includes(normalizedSearchQuery) : true
      )
      .sort((first, second) => {
        return (first.name ?? '').localeCompare(second.name ?? '', 'fr', { sensitivity: 'base' });
      });
  }, [addItemDialog, existingProductIds, products]);

  const totalItemsCount = allShoppingItems.length;

  const checkedItemsCount = useMemo(() => {
    return allShoppingItems.filter((item) => item.isChecked === true).length;
  }, [allShoppingItems]);

  const optimisticItemsCount = useMemo(() => {
    return allShoppingItems.filter((item) => isOptimisticItem(item.id)).length;
  }, [allShoppingItems]);

  const isBusy = isSubmittingAction || isSyncingQueue;

  const enqueueAction = useCallback(
    async (input: EnqueuePendingShoppingListActionInput, message: string) => {
      await enqueuePendingShoppingListAction(input);
      await refreshPendingActionsCount();
      setSnackbarMessage(message);
    },
    [refreshPendingActionsCount]
  );

  const handleRefresh = useCallback(async () => {
    await Promise.all([
      shoppingListQuery.refetch(),
      productsQuery.refetch(),
      refreshPendingActionsCount(),
    ]);
  }, [productsQuery, refreshPendingActionsCount, shoppingListQuery]);

  const handleSyncQueue = useCallback(async () => {
    if (isOffline || isBusy) {
      return;
    }

    setIsSyncingQueue(true);

    try {
      const result = await flushPendingShoppingListActions({
        addItem: async (payload) => {
          await addShoppingListItem({
            productId: payload.productId,
          });
        },
        checkItem: async (payload) => {
          await checkShoppingListItem(payload.itemId, {
            checkedQuantity: payload.checkedQuantity,
            checkedUnitId: payload.checkedUnitId,
          });
        },
        uncheckItem: async (payload) => {
          await uncheckShoppingListItem(payload.itemId);
        },
        deleteItem: async (payload) => {
          await deleteShoppingListItem(payload.itemId);
        },
        clearList: async () => {
          await clearShoppingList();
        },
        finishList: async () => {
          await finishShoppingList();
        },
        checkThresholds: async () => {
          await checkThresholds();
        },
      });

      if (result.syncedCount > 0 || result.failedCount > 0) {
        await invalidateShoppingListQueries(queryClient, true);
      }

      await refreshPendingActionsCount();

      if (result.status === 'retry_later' && result.retryCount > 0) {
        setSnackbarMessage(
          `${result.syncedCount} action(s) synchronisee(s), ${result.retryCount} encore en attente.`
        );
        return;
      }

      if (result.status === 'failed' && result.failedCount > 0) {
        setSnackbarMessage(`${result.failedCount} action(s) ont echoue a la synchronisation.`);
        return;
      }

      if (result.status === 'synced' && result.syncedCount > 0) {
        setSnackbarMessage(`${result.syncedCount} action(s) hors ligne synchronisee(s).`);
      }
    } finally {
      setIsSyncingQueue(false);
    }
  }, [isBusy, isOffline, queryClient, refreshPendingActionsCount]);

  const handleOpenAddItemDialog = useCallback(() => {
    setAddItemDialog({
      productId: '',
      searchQuery: '',
      errorMessage: null,
    });
  }, []);

  const handleSubmitAddItem = useCallback(async () => {
    if (!addItemDialog) {
      return;
    }

    const selectedProduct = productsById.get(addItemDialog.productId);
    if (!selectedProduct || !selectedProduct.id) {
      setAddItemDialog((currentDialog) => {
        if (!currentDialog) {
          return currentDialog;
        }

        return {
          ...currentDialog,
          errorMessage: 'Choisis un produit a ajouter',
        };
      });
      return;
    }

    applyOptimisticAdd(queryClient, selectedProduct);
    setAddItemDialog(null);

    const actionInput: EnqueuePendingShoppingListActionInput = {
      type: 'add_item',
      payload: {
        productId: selectedProduct.id,
      },
    };

    if (isOffline) {
      await enqueueAction(actionInput, 'Article ajoute hors ligne. Synchronisation a venir.');
      return;
    }

    setIsSubmittingAction(true);

    try {
      await addShoppingListItem({ productId: selectedProduct.id });
      await invalidateShoppingListQueries(queryClient, false);
      setSnackbarMessage('Article ajoute a la liste de courses.');
    } catch (error) {
      if (shouldQueueAfterError(error)) {
        await enqueueAction(actionInput, 'Reseau instable: ajout place en file hors ligne.');
        return;
      }

      await invalidateShoppingListQueries(queryClient, false);
      setSnackbarMessage(mapErrorToUi(error).message);
    } finally {
      setIsSubmittingAction(false);
    }
  }, [addItemDialog, enqueueAction, isOffline, productsById, queryClient]);

  const handleOpenCheckDialog = useCallback(
    (item: ShoppingListItemResponse) => {
      const itemId = item.id;
      const productId = item.product?.id;

      if (!itemId || !productId) {
        setSnackbarMessage('Impossible de cocher cet article.');
        return;
      }

      if (isOptimisticItem(itemId)) {
        setSnackbarMessage('Synchronise d abord cet article avant de le cocher.');
        return;
      }

      const product = productsById.get(productId);
      const defaultUnitId = item.checkedUnit?.id ?? product?.baseUnit?.id ?? '';
      const defaultUnitLabel =
        item.checkedUnit?.label ?? item.checkedUnit?.code ?? product?.baseUnit?.label ?? product?.baseUnit?.code ?? '';

      setCheckItemDialog({
        itemId,
        productId,
        quantity: item.checkedQuantity ? String(item.checkedQuantity) : '1',
        unitId: defaultUnitId,
        unitLabel: defaultUnitLabel,
        errorMessage: null,
      });
    },
    [productsById]
  );

  const handleSubmitCheckItem = useCallback(async () => {
    if (!checkItemDialog) {
      return;
    }

    const checkedQuantity = parseQuantityInput(checkItemDialog.quantity);
    if (!Number.isFinite(checkedQuantity) || checkedQuantity <= 0) {
      setCheckItemDialog((currentDialog) => {
        if (!currentDialog) {
          return currentDialog;
        }

        return {
          ...currentDialog,
          errorMessage: 'Renseigne une quantite strictement positive',
        };
      });
      return;
    }

    if (!checkItemDialog.unitId) {
      setCheckItemDialog((currentDialog) => {
        if (!currentDialog) {
          return currentDialog;
        }

        return {
          ...currentDialog,
          errorMessage: 'Choisis une unite',
        };
      });
      return;
    }

    const selectedUnitLabel =
      checkDialogUnitOptions.find((unitOption) => unitOption.id === checkItemDialog.unitId)?.label ??
      checkItemDialog.unitLabel ??
      checkItemDialog.unitId;

    applyOptimisticCheck(
      queryClient,
      checkItemDialog.itemId,
      checkedQuantity,
      checkItemDialog.unitId,
      selectedUnitLabel
    );

    const actionInput: EnqueuePendingShoppingListActionInput = {
      type: 'check_item',
      payload: {
        itemId: checkItemDialog.itemId,
        checkedQuantity,
        checkedUnitId: checkItemDialog.unitId,
      },
    };

    setCheckItemDialog(null);

    if (isOffline) {
      await enqueueAction(actionInput, 'Article coche hors ligne. Synchronisation a venir.');
      return;
    }

    setIsSubmittingAction(true);

    try {
      await checkShoppingListItem(actionInput.payload.itemId, {
        checkedQuantity: actionInput.payload.checkedQuantity,
        checkedUnitId: actionInput.payload.checkedUnitId,
      });
      await invalidateShoppingListQueries(queryClient, false);
      setSnackbarMessage('Article coche.');
    } catch (error) {
      if (shouldQueueAfterError(error)) {
        await enqueueAction(actionInput, 'Reseau instable: action enregistree hors ligne.');
        return;
      }

      await invalidateShoppingListQueries(queryClient, false);
      setSnackbarMessage(mapErrorToUi(error).message);
    } finally {
      setIsSubmittingAction(false);
    }
  }, [checkDialogUnitOptions, checkItemDialog, enqueueAction, isOffline, queryClient]);

  const handleUncheckItem = useCallback(
    async (item: ShoppingListItemResponse) => {
      const itemId = item.id;
      if (!itemId) {
        return;
      }

      if (isOptimisticItem(itemId)) {
        setSnackbarMessage('Synchronise d abord cet article avant de le modifier.');
        return;
      }

      applyOptimisticUncheck(queryClient, itemId);

      const actionInput: EnqueuePendingShoppingListActionInput = {
        type: 'uncheck_item',
        payload: {
          itemId,
        },
      };

      if (isOffline) {
        await enqueueAction(actionInput, 'Article decoche hors ligne.');
        return;
      }

      setIsSubmittingAction(true);

      try {
        await uncheckShoppingListItem(itemId);
        await invalidateShoppingListQueries(queryClient, false);
      } catch (error) {
        if (shouldQueueAfterError(error)) {
          await enqueueAction(actionInput, 'Reseau instable: action enregistree hors ligne.');
          return;
        }

        await invalidateShoppingListQueries(queryClient, false);
        setSnackbarMessage(mapErrorToUi(error).message);
      } finally {
        setIsSubmittingAction(false);
      }
    },
    [enqueueAction, isOffline, queryClient]
  );

  const handleDeleteItem = useCallback(
    async (item: ShoppingListItemResponse) => {
      const itemId = item.id;
      if (!itemId) {
        return;
      }

      if (isOptimisticItem(itemId)) {
        setSnackbarMessage('Synchronise d abord cet article avant de le supprimer.');
        return;
      }

      applyOptimisticDelete(queryClient, itemId);

      const actionInput: EnqueuePendingShoppingListActionInput = {
        type: 'delete_item',
        payload: {
          itemId,
        },
      };

      if (isOffline) {
        await enqueueAction(actionInput, 'Article supprime hors ligne.');
        return;
      }

      setIsSubmittingAction(true);

      try {
        await deleteShoppingListItem(itemId);
        await invalidateShoppingListQueries(queryClient, false);
      } catch (error) {
        if (shouldQueueAfterError(error)) {
          await enqueueAction(actionInput, 'Reseau instable: suppression en file hors ligne.');
          return;
        }

        await invalidateShoppingListQueries(queryClient, false);
        setSnackbarMessage(mapErrorToUi(error).message);
      } finally {
        setIsSubmittingAction(false);
      }
    },
    [enqueueAction, isOffline, queryClient]
  );

  const handleConfirmClearList = useCallback(async () => {
    setIsClearDialogVisible(false);
    applyOptimisticClear(queryClient);

    const actionInput: EnqueuePendingShoppingListActionInput = {
      type: 'clear_list',
    };

    if (isOffline) {
      await enqueueAction(actionInput, 'Liste videe hors ligne.');
      return;
    }

    setIsSubmittingAction(true);

    try {
      await clearShoppingList();
      await invalidateShoppingListQueries(queryClient, false);
      setSnackbarMessage('Liste de courses videe.');
    } catch (error) {
      if (shouldQueueAfterError(error)) {
        await enqueueAction(actionInput, 'Reseau instable: action en file hors ligne.');
        return;
      }

      await invalidateShoppingListQueries(queryClient, false);
      setSnackbarMessage(mapErrorToUi(error).message);
    } finally {
      setIsSubmittingAction(false);
    }
  }, [enqueueAction, isOffline, queryClient]);

  const handleConfirmFinishList = useCallback(async () => {
    setIsFinishDialogVisible(false);
    applyOptimisticFinish(queryClient);

    const actionInput: EnqueuePendingShoppingListActionInput = {
      type: 'finish_list',
    };

    if (isOffline) {
      await enqueueAction(actionInput, 'Finalisation enregistree hors ligne.');
      return;
    }

    setIsSubmittingAction(true);

    try {
      const response = await finishShoppingList();
      await invalidateShoppingListQueries(queryClient, true);
      const processedCount = response.data.processedCount ?? 0;
      setSnackbarMessage(
        processedCount > 0
          ? `${processedCount} article(s) transferes vers le stock.`
          : 'Aucun article coche a finaliser.'
      );
    } catch (error) {
      if (shouldQueueAfterError(error)) {
        await enqueueAction(actionInput, 'Reseau instable: finalisation en file hors ligne.');
        return;
      }

      await invalidateShoppingListQueries(queryClient, true);
      setSnackbarMessage(mapErrorToUi(error).message);
    } finally {
      setIsSubmittingAction(false);
    }
  }, [enqueueAction, isOffline, queryClient]);

  const handleCheckThresholds = useCallback(async () => {
    const actionInput: EnqueuePendingShoppingListActionInput = {
      type: 'check_thresholds',
    };

    if (isOffline) {
      await enqueueAction(actionInput, 'Verification des seuils planifiee hors ligne.');
      return;
    }

    setIsSubmittingAction(true);

    try {
      const response = await checkThresholds();
      await invalidateShoppingListQueries(queryClient, false);

      const addedCount = response.data.addedCount ?? 0;
      setSnackbarMessage(
        addedCount > 0
          ? `${addedCount} article(s) ajoute(s) automatiquement aux courses.`
          : 'Aucun nouvel article ajoute depuis les seuils bas.'
      );
    } catch (error) {
      if (shouldQueueAfterError(error)) {
        await enqueueAction(actionInput, 'Reseau instable: verification en file hors ligne.');
        return;
      }

      setSnackbarMessage(mapErrorToUi(error).message);
    } finally {
      setIsSubmittingAction(false);
    }
  }, [enqueueAction, isOffline, queryClient]);

  const renderShoppingListGroup = useCallback(
    ({ item }: { item: ShoppingListCategoryGroupResponse }) => {
      const categoryName = item.category?.name ?? 'Sans categorie';
      const categoryColor = item.category?.color ?? '#D8DBE2';
      const groupItems = item.items ?? [];

      return (
        <Card mode="outlined" style={styles.groupCard}>
          <Card.Content style={styles.groupCardContent}>
            <View style={styles.groupHeader}>
              <View style={[styles.categoryDot, { backgroundColor: categoryColor }]} />
              <Text variant="titleMedium">{categoryName}</Text>
              <Chip compact>{groupItems.length}</Chip>
            </View>

            {groupItems.map((shoppingItem, itemIndex) => {
              const itemId = shoppingItem.id;
              const optimistic = isOptimisticItem(itemId);

              return (
                <View
                  key={itemId ?? `${categoryName}-${itemIndex}`}
                  style={[
                    styles.shoppingItemRow,
                    shoppingItem.isChecked ? styles.shoppingItemRowChecked : null,
                  ]}>
                  <View style={styles.shoppingItemMain}>
                    <Text variant="titleMedium">{shoppingItem.product?.name ?? 'Produit sans nom'}</Text>

                    <View style={styles.shoppingItemMetaRow}>
                      {shoppingItem.addedAutomatically ? (
                        <Chip compact mode="outlined" icon="auto-fix">
                          Auto
                        </Chip>
                      ) : null}

                      {optimistic ? (
                        <Chip compact mode="outlined" icon="clock-outline">
                          En attente sync
                        </Chip>
                      ) : null}

                      {shoppingItem.isChecked ? (
                        <Chip compact icon="check-circle-outline" mode="flat">
                          Coche
                        </Chip>
                      ) : (
                        <Chip compact icon="cart-outline" mode="outlined">
                          A acheter
                        </Chip>
                      )}
                    </View>

                    {shoppingItem.isChecked ? (
                      <Text style={styles.checkedDetailsText}>
                        Achat: {formatQuantity(shoppingItem.checkedQuantity)}{' '}
                        {shoppingItem.checkedUnit?.label ?? shoppingItem.checkedUnit?.code ?? ''}
                      </Text>
                    ) : null}
                  </View>

                  <View style={styles.shoppingItemActionsRow}>
                    {shoppingItem.isChecked ? (
                      <Button
                        mode="text"
                        icon="undo-variant"
                        onPress={() => void handleUncheckItem(shoppingItem)}
                        disabled={isBusy || optimistic}>
                        Decocher
                      </Button>
                    ) : (
                      <Button
                        mode="text"
                        icon="check"
                        onPress={() => handleOpenCheckDialog(shoppingItem)}
                        disabled={isBusy || optimistic}>
                        Cocher
                      </Button>
                    )}

                    <Button
                      mode="text"
                      icon="delete-outline"
                      textColor={DANGER_COLOR}
                      onPress={() => void handleDeleteItem(shoppingItem)}
                      disabled={isBusy || optimistic}>
                      Supprimer
                    </Button>
                  </View>
                </View>
              );
            })}
          </Card.Content>
        </Card>
      );
    },
    [handleDeleteItem, handleOpenCheckDialog, handleUncheckItem, isBusy]
  );

  const isInitialLoading = shoppingListQuery.isLoading;
  const hasLoadError = shoppingListQuery.isError;
  const isRefreshing = shoppingListQuery.isFetching || productsQuery.isFetching;

  return (
    <ScreenShell
      title="Liste de courses"
      subtitle="Coche tes achats et finalise pour mettre a jour ton stock automatiquement.">
      {isOffline ? (
        <Text style={styles.offlineText}>Tu es hors ligne: tes actions seront synchronisees plus tard.</Text>
      ) : null}

      {pendingActionsCount > 0 ? (
        <Card mode="outlined" style={styles.pendingCard}>
          <Card.Content style={styles.pendingCardContent}>
            <Text>{pendingActionsCount} action(s) en attente de synchronisation.</Text>
            {!isOffline ? (
              <Button
                mode="outlined"
                icon="sync"
                onPress={() => void handleSyncQueue()}
                loading={isSyncingQueue}
                disabled={isBusy}>
                Synchroniser
              </Button>
            ) : null}
          </Card.Content>
        </Card>
      ) : null}

      <Card mode="outlined" style={styles.summaryCard}>
        <Card.Content style={styles.summaryContent}>
          <Text>{totalItemsCount} article(s) au total</Text>
          <Text>{checkedItemsCount} coche(s)</Text>
          {optimisticItemsCount > 0 ? <Text>{optimisticItemsCount} en attente sync</Text> : null}
        </Card.Content>
      </Card>

      <View style={styles.actionsRow}>
        <Button
          mode="outlined"
          icon="update"
          onPress={() => void handleCheckThresholds()}
          disabled={isBusy}>
          Verifier seuils
        </Button>
        <Button
          mode="outlined"
          icon="delete-sweep-outline"
          onPress={() => setIsClearDialogVisible(true)}
          disabled={isBusy || totalItemsCount === 0}>
          Vider
        </Button>
      </View>

      <View style={styles.actionsRow}>
        <Button
          mode="contained-tonal"
          icon="basket-check"
          onPress={() => setIsFinishDialogVisible(true)}
          disabled={isBusy || checkedItemsCount === 0}>
          Finaliser les courses
        </Button>
      </View>

      {productsQuery.isError ? (
        <Text style={styles.warningText}>
          Le chargement des produits a echoue: l ajout manuel peut etre limite.
        </Text>
      ) : null}

      {isInitialLoading ? (
        <View style={styles.centeredState}>
          <Text>Chargement de ta liste de courses...</Text>
        </View>
      ) : hasLoadError ? (
        <View style={styles.centeredState}>
          <MaterialCommunityIcons name="alert-circle-outline" size={32} color={DANGER_COLOR} />
          <Text style={styles.errorText}>{mapErrorToUi(shoppingListQuery.error).message}</Text>
          <Button mode="outlined" onPress={() => void handleRefresh()}>
            Reessayer
          </Button>
        </View>
      ) : shoppingGroups.length === 0 ? (
        <View style={styles.centeredState}>
          <MaterialCommunityIcons name="cart-off" size={32} color="#60646C" />
          <Text style={styles.emptyText}>Ta liste de courses est vide.</Text>
          <Button mode="contained" onPress={handleOpenAddItemDialog} disabled={isBusy}>
            Ajouter un article
          </Button>
        </View>
      ) : (
        <FlatList
          data={shoppingGroups}
          keyExtractor={(group, index) => `${group.category?.name ?? 'category'}-${index}`}
          renderItem={renderShoppingListGroup}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void handleRefresh()} />}
        />
      )}

      <FAB
        icon="plus"
        label="Ajouter"
        style={styles.fab}
        onPress={handleOpenAddItemDialog}
        disabled={isBusy}
      />

      <Portal>
        <Dialog visible={Boolean(addItemDialog)} onDismiss={() => setAddItemDialog(null)}>
          <Dialog.Title>Ajouter un article</Dialog.Title>
          <Dialog.Content style={styles.dialogContent}>
            <TextInput
              mode="outlined"
              label="Rechercher un produit"
              value={addItemDialog?.searchQuery ?? ''}
              onChangeText={(text) => {
                setAddItemDialog((currentDialog) => {
                  if (!currentDialog) {
                    return currentDialog;
                  }

                  return {
                    ...currentDialog,
                    searchQuery: text,
                    errorMessage: null,
                  };
                });
              }}
            />

            <View style={styles.optionsWrap}>
              {addDialogAvailableProducts.length === 0 ? (
                <Text style={styles.hintText}>Aucun produit disponible pour cet ajout.</Text>
              ) : (
                addDialogAvailableProducts.map((product) => {
                  if (!product.id) {
                    return null;
                  }

                  const isSelected = addItemDialog?.productId === product.id;

                  return (
                    <Chip
                      key={product.id}
                      selected={isSelected}
                      mode={isSelected ? 'flat' : 'outlined'}
                      onPress={() => {
                        setAddItemDialog((currentDialog) => {
                          if (!currentDialog) {
                            return currentDialog;
                          }

                          return {
                            ...currentDialog,
                            productId: product.id!,
                            errorMessage: null,
                          };
                        });
                      }}>
                      {product.name}
                    </Chip>
                  );
                })
              )}
            </View>

            {addItemDialog?.errorMessage ? (
              <HelperText type="error" visible>
                {addItemDialog.errorMessage}
              </HelperText>
            ) : null}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setAddItemDialog(null)}>Annuler</Button>
            <Button onPress={() => void handleSubmitAddItem()}>Ajouter</Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={Boolean(checkItemDialog)} onDismiss={() => setCheckItemDialog(null)}>
          <Dialog.Title>Cocher l article</Dialog.Title>
          <Dialog.Content style={styles.dialogContent}>
            <Text>
              {checkItemDialog?.productId
                ? productsById.get(checkItemDialog.productId)?.name ?? 'Produit'
                : 'Produit'}
            </Text>

            <TextInput
              mode="outlined"
              label="Quantite achetee"
              keyboardType="decimal-pad"
              value={checkItemDialog?.quantity ?? ''}
              onChangeText={(text) => {
                setCheckItemDialog((currentDialog) => {
                  if (!currentDialog) {
                    return currentDialog;
                  }

                  return {
                    ...currentDialog,
                    quantity: text,
                    errorMessage: null,
                  };
                });
              }}
            />

            <Text variant="labelLarge">Unite</Text>
            {checkDialogUnitsQuery.isLoading ? (
              <Text style={styles.hintText}>Chargement des unites...</Text>
            ) : checkDialogUnitsQuery.isError ? (
              <Text style={styles.errorText}>Impossible de charger les unites.</Text>
            ) : (
              <View style={styles.optionsWrap}>
                {checkDialogUnitOptions.map((unitOption) => {
                  const isSelected = checkItemDialog?.unitId === unitOption.id;

                  return (
                    <Chip
                      key={unitOption.id}
                      selected={isSelected}
                      mode={isSelected ? 'flat' : 'outlined'}
                      onPress={() => {
                        setCheckItemDialog((currentDialog) => {
                          if (!currentDialog) {
                            return currentDialog;
                          }

                          return {
                            ...currentDialog,
                            unitId: unitOption.id,
                            unitLabel: unitOption.label,
                            errorMessage: null,
                          };
                        });
                      }}>
                      {unitOption.label}
                    </Chip>
                  );
                })}
              </View>
            )}

            {checkItemDialog?.errorMessage ? (
              <HelperText type="error" visible>
                {checkItemDialog.errorMessage}
              </HelperText>
            ) : null}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setCheckItemDialog(null)}>Annuler</Button>
            <Button onPress={() => void handleSubmitCheckItem()}>Valider</Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={isClearDialogVisible} onDismiss={() => setIsClearDialogVisible(false)}>
          <Dialog.Title>Vider la liste ?</Dialog.Title>
          <Dialog.Content>
            <Text>Tous les articles de la liste de courses seront supprimes.</Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setIsClearDialogVisible(false)}>Annuler</Button>
            <Button textColor={DANGER_COLOR} onPress={() => void handleConfirmClearList()}>
              Vider
            </Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={isFinishDialogVisible} onDismiss={() => setIsFinishDialogVisible(false)}>
          <Dialog.Title>Finaliser les courses ?</Dialog.Title>
          <Dialog.Content>
            <Text>
              Les articles coches seront retires de la liste et reportes dans ton stock.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setIsFinishDialogVisible(false)}>Annuler</Button>
            <Button onPress={() => void handleConfirmFinishList()}>Finaliser</Button>
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
  summaryCard: {
    borderRadius: 14,
    elevation: 0,
  },
  summaryContent: {
    gap: 4,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  warningText: {
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
    opacity: 0.8,
    textAlign: 'center',
  },
  list: {
    flex: 1,
  },
  listContent: {
    gap: 8,
    paddingBottom: 96,
  },
  groupCard: {
    borderRadius: 16,
    elevation: 0,
  },
  groupCardContent: {
    gap: 10,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  shoppingItemRow: {
    borderWidth: 1,
    borderColor: '#D8DBE2',
    borderRadius: 12,
    padding: 10,
    gap: 8,
  },
  shoppingItemRowChecked: {
    backgroundColor: '#E8F5E9',
  },
  shoppingItemMain: {
    gap: 6,
  },
  shoppingItemMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  checkedDetailsText: {
    opacity: 0.85,
  },
  shoppingItemActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  dialogContent: {
    gap: 8,
  },
  optionsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  hintText: {
    opacity: 0.8,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
  },
});

