import { zodResolver } from '@hookform/resolvers/zod';
import { useNetInfo } from '@react-native-community/netinfo';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { ActivityIndicator, Image, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, Chip, HelperText, Snackbar, Text, TextInput } from 'react-native-paper';

import { ScreenShell } from '@/components/ui/screen-shell';
import { useGetCategories } from '@/services/api/generated/catégories/catégories';
import type { CategoryResponse, StockItemResponse } from '@/services/api/generated/model';
import {
  useCreateProduct,
  useGetProduct,
  useUploadProductPhoto,
  useUpdateProduct,
} from '@/services/api/generated/produits/produits';
import {
  useGetQuantityTypes,
  useGetUnitsByType,
} from '@/services/api/generated/référentiel-quantités/référentiel-quantités';
import type { ListStockItemsQueryResult } from '@/services/api/generated/stock/stock';
import {
  useCreateStockItem,
  useListStockItems,
  useUpdateExpiration,
  useUpdateQuantity,
  useUpdateThreshold,
} from '@/services/api/generated/stock/stock';
import { ApiClientError } from '@/services/api/http-client';
import { queryKeys } from '@/services/api/query-keys';
import { invalidateStockAndProductsQueries } from '@/services/api/query-invalidations';
import {
  enqueuePendingStockFormSubmission,
  flushPendingStockFormSubmissions,
  getPendingStockFormSubmissionsCount,
  type EnqueuePendingStockFormSubmissionInput,
  type PendingPhotoSelection,
  type PendingStockFormSubmission,
} from '@/services/offline/stock-form-submissions-queue';
import { mapErrorToUi } from '@/utils/error-mapper';
import { stockFormSchema, type StockFormValues } from '@/utils/validation';

const STOCK_ROUTE = '/(tabs)/stock' as Href;

const DEFAULT_FORM_VALUES: StockFormValues = {
  productName: '',
  categoryId: '',
  quantityTypeId: '',
  baseUnitId: '',
  quantity: '',
  lowThreshold: '',
  expirationDate: '',
};

interface OptimisticEditPayload {
  stockItemId: string;
  productName: string;
  category?: CategoryResponse;
  quantity: number;
  lowThreshold?: number;
  expirationDate?: string;
}

function getFirstRouteParamValue(param: string | string[] | undefined): string | null {
  if (!param) {
    return null;
  }

  return Array.isArray(param) ? (param[0] ?? null) : param;
}

function toDateInputValue(value: string | undefined): string {
  if (!value) {
    return '';
  }

  const trimmed = value.trim();
  return trimmed.includes('T') ? trimmed.slice(0, 10) : trimmed;
}

function parseRequiredNumberInput(value: string): number {
  return Number.parseFloat(value.replace(',', '.'));
}

function parseOptionalNumberInput(value: string | undefined): number | undefined {
  if (!value || !value.trim()) {
    return undefined;
  }

  return Number.parseFloat(value.replace(',', '.'));
}

function normalizeOptionalDateInput(value: string | undefined): string | undefined {
  if (!value || !value.trim()) {
    return undefined;
  }

  return value.trim();
}

function toPendingPhotoSelection(asset: ImagePicker.ImagePickerAsset): PendingPhotoSelection {
  return {
    uri: asset.uri,
    mimeType: asset.mimeType ?? null,
    fileName: asset.fileName ?? null,
  };
}

function shouldQueueSubmissionError(error: unknown): boolean {
  return !(error instanceof ApiClientError && error.status >= 400 && error.status < 500);
}

function patchStockItemInResponse<T extends { data: StockItemResponse[] }>(
  response: T | undefined,
  payload: OptimisticEditPayload
): T | undefined {
  if (!response) {
    return response;
  }

  let hasUpdated = false;
  const nextItems = response.data.map((item) => {
    if (item.id !== payload.stockItemId) {
      return item;
    }

    hasUpdated = true;
    return {
      ...item,
      quantity: payload.quantity,
      lowThreshold: payload.lowThreshold,
      expirationDate: payload.expirationDate,
      product: item.product
        ? {
            ...item.product,
            name: payload.productName,
            category: payload.category ?? item.product.category,
          }
        : {
            name: payload.productName,
            category: payload.category,
          },
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

function applyOptimisticEditUpdate(queryClient: QueryClient, payload: OptimisticEditPayload): void {
  queryClient.setQueriesData<ListStockItemsQueryResult>(
    { queryKey: queryKeys.stock.listPrefix },
    (current) => patchStockItemInResponse(current, payload)
  );

  queryClient.setQueriesData<ListStockItemsQueryResult>(
    { queryKey: queryKeys.stock.expiring },
    (current) => patchStockItemInResponse(current, payload)
  );
}

export default function StockItemFormScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const netInfo = useNetInfo();

  const { stockItemId: stockItemIdParam } =
    useLocalSearchParams<{ stockItemId?: string | string[] }>();
  const stockItemId = useMemo(() => getFirstRouteParamValue(stockItemIdParam), [stockItemIdParam]);
  const isEditing = Boolean(stockItemId);
  const isOffline = netInfo.isConnected === false || netInfo.isInternetReachable === false;

  const [selectedPhoto, setSelectedPhoto] = useState<PendingPhotoSelection | null>(null);
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);
  const [isSyncingQueue, setIsSyncingQueue] = useState(false);
  const [isPickingPhoto, setIsPickingPhoto] = useState(false);

  const categoriesQuery = useGetCategories();
  const quantityTypesQuery = useGetQuantityTypes();
  const stockItemsQuery = useListStockItems();

  const stockItem = useMemo(() => {
    if (!isEditing || !stockItemId) {
      return null;
    }

    return (stockItemsQuery.data?.data ?? []).find((item) => item.id === stockItemId) ?? null;
  }, [isEditing, stockItemId, stockItemsQuery.data]);

  const productId = stockItem?.product?.id ?? '';
  const productQuery = useGetProduct(productId, {
    query: {
      enabled: isEditing && Boolean(productId),
    },
  });

  const {
    data: pendingSubmissionsCount = 0,
    refetch: refreshPendingSubmissionsCount,
  } = useQuery({
    queryKey: ['offline-stock-form-submissions-count'],
    queryFn: getPendingStockFormSubmissionsCount,
  });

  const initialFormValues = useMemo<StockFormValues>(() => {
    if (!isEditing || !stockItem) {
      return DEFAULT_FORM_VALUES;
    }

    return {
      productName: stockItem.product?.name ?? '',
      categoryId: stockItem.product?.category?.id ?? '',
      quantityTypeId: productQuery.data?.data.quantityType?.id ?? '',
      baseUnitId: productQuery.data?.data.baseUnit?.id ?? stockItem.product?.baseUnit?.id ?? '',
      quantity:
        typeof stockItem.quantity === 'number' && !Number.isNaN(stockItem.quantity)
          ? String(stockItem.quantity)
          : '',
      lowThreshold:
        typeof stockItem.lowThreshold === 'number' && !Number.isNaN(stockItem.lowThreshold)
          ? String(stockItem.lowThreshold)
          : '',
      expirationDate: toDateInputValue(stockItem.expirationDate),
    };
  }, [isEditing, productQuery.data, stockItem]);

  const { control, handleSubmit, formState, setValue, setError, clearErrors } =
    useForm<StockFormValues>({
      resolver: zodResolver(stockFormSchema),
      values: initialFormValues,
    });

  const selectedCategoryId = useWatch({ control, name: 'categoryId' }) ?? '';
  const selectedQuantityTypeId = useWatch({ control, name: 'quantityTypeId' }) ?? '';
  const selectedBaseUnitId = useWatch({ control, name: 'baseUnitId' }) ?? '';

  const unitsQuery = useGetUnitsByType(selectedQuantityTypeId, {
    query: {
      enabled: !isEditing && Boolean(selectedQuantityTypeId),
    },
  });

  const createProductMutation = useCreateProduct();
  const updateProductMutation = useUpdateProduct();
  const uploadProductPhotoMutation = useUploadProductPhoto();
  const createStockItemMutation = useCreateStockItem();
  const updateQuantityMutation = useUpdateQuantity();
  const updateThresholdMutation = useUpdateThreshold();
  const updateExpirationMutation = useUpdateExpiration();

  const isSubmitting =
    isSyncingQueue ||
    isPickingPhoto ||
    createProductMutation.isPending ||
    updateProductMutation.isPending ||
    uploadProductPhotoMutation.isPending ||
    createStockItemMutation.isPending ||
    updateQuantityMutation.isPending ||
    updateThresholdMutation.isPending ||
    updateExpirationMutation.isPending;

  const categoryById = useMemo(() => {
    const categoryMap = new Map<string, CategoryResponse>();

    for (const category of categoriesQuery.data?.data ?? []) {
      if (!category.id) {
        continue;
      }

      categoryMap.set(category.id, category);
    }

    return categoryMap;
  }, [categoriesQuery.data]);

  const uploadProductPhotoIfNeeded = useCallback(
    async (targetProductId: string, photo: PendingPhotoSelection | undefined) => {
      if (!photo?.uri) {
        return;
      }

      const response = await fetch(photo.uri);
      if (!response.ok) {
        throw new Error('Impossible de lire la photo selectionnee');
      }

      const rawBlob = await response.blob();
      const blobWithMimeType =
        rawBlob.type || !photo.mimeType ? rawBlob : rawBlob.slice(0, rawBlob.size, photo.mimeType);

      await uploadProductPhotoMutation.mutateAsync({
        id: targetProductId,
        data: {
          file: blobWithMimeType,
        },
      });
    },
    [uploadProductPhotoMutation]
  );

  const executeOnlineSubmission = useCallback(
    async (submission: PendingStockFormSubmission | EnqueuePendingStockFormSubmissionInput) => {
      if (submission.mode === 'create') {
        const createdProduct = await createProductMutation.mutateAsync({
          data: {
            name: submission.productName,
            categoryId: submission.categoryId,
            quantityTypeId: submission.quantityTypeId,
            baseUnitId: submission.baseUnitId,
          },
        });

        const createdProductId = createdProduct.data.id;
        if (!createdProductId) {
          throw new Error('Identifiant produit manquant apres creation');
        }

        await createStockItemMutation.mutateAsync({
          data: {
            productId: createdProductId,
            quantity: submission.quantity,
            lowThreshold: submission.lowThreshold,
            expirationDate: submission.expirationDate,
          },
        });

        await uploadProductPhotoIfNeeded(createdProductId, submission.photo);
        return;
      }

      await updateProductMutation.mutateAsync({
        id: submission.productId,
        data: {
          name: submission.productName,
          categoryId: submission.categoryId,
        },
      });

      await updateQuantityMutation.mutateAsync({
        id: submission.stockItemId,
        data: {
          quantity: submission.quantity,
        },
      });

      await updateThresholdMutation.mutateAsync({
        id: submission.stockItemId,
        data: {
          lowThreshold: submission.lowThreshold,
        },
      });

      await updateExpirationMutation.mutateAsync({
        id: submission.stockItemId,
        data: {
          expirationDate: submission.expirationDate,
        },
      });

      await uploadProductPhotoIfNeeded(submission.productId, submission.photo);
    },
    [
      createProductMutation,
      createStockItemMutation,
      updateProductMutation,
      updateQuantityMutation,
      updateThresholdMutation,
      updateExpirationMutation,
      uploadProductPhotoIfNeeded,
    ]
  );

  const handleFlushPendingSubmissions = useCallback(async () => {
    if (isOffline || isSyncingQueue) {
      return;
    }

    setIsSyncingQueue(true);

    try {
      const result = await flushPendingStockFormSubmissions(async (submission) => {
        await executeOnlineSubmission(submission);
      });

      if (result.syncedCount > 0) {
        await invalidateStockAndProductsQueries(queryClient);
      }

      await refreshPendingSubmissionsCount();

      if (result.status === 'synced' && result.syncedCount > 0) {
        setSnackbarMessage(`${result.syncedCount} operation(s) en attente ont ete synchronisees.`);
      }

      if (result.status === 'retry_later' && result.retryCount > 0) {
        setSnackbarMessage(
          `${result.syncedCount} operation(s) synchronisee(s), ${result.retryCount} encore en attente.`
        );
      }

      if (result.status === 'failed' && result.failedCount > 0) {
        setSnackbarMessage(`${result.failedCount} operation(s) n'ont pas pu etre rejouees.`);
      }
    } finally {
      setIsSyncingQueue(false);
    }
  }, [
    executeOnlineSubmission,
    isOffline,
    isSyncingQueue,
    queryClient,
    refreshPendingSubmissionsCount,
  ]);

  const handlePickPhoto = useCallback(async () => {
    setIsPickingPhoto(true);

    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permissionResult.granted) {
        setSnackbarMessage('Autorise l acces a la galerie pour ajouter une photo.');
        return;
      }

      const pickerResult = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
        allowsEditing: true,
      });

      if (pickerResult.canceled || !pickerResult.assets[0]) {
        return;
      }

      setSelectedPhoto(toPendingPhotoSelection(pickerResult.assets[0]));
    } catch (error) {
      setSnackbarMessage(mapErrorToUi(error).message);
    } finally {
      setIsPickingPhoto(false);
    }
  }, []);

  const handleRetryLoading = useCallback(() => {
    categoriesQuery.refetch();
    quantityTypesQuery.refetch();
    stockItemsQuery.refetch();
    if (productId) {
      productQuery.refetch();
    }
  }, [categoriesQuery, productId, productQuery, quantityTypesQuery, stockItemsQuery]);

  const handleSubmitForm = handleSubmit(async (values) => {
    const productName = values.productName.trim();
    const categoryId = values.categoryId;
    const quantityTypeId = values.quantityTypeId?.trim() ?? '';
    const baseUnitId = values.baseUnitId?.trim() ?? '';
    const quantity = parseRequiredNumberInput(values.quantity);
    const lowThreshold = parseOptionalNumberInput(values.lowThreshold);
    const expirationDate = normalizeOptionalDateInput(values.expirationDate);

    if (!isEditing && !quantityTypeId) {
      setError('quantityTypeId', {
        type: 'manual',
        message: 'Le type de quantite est requis',
      });
      return;
    }

    if (!isEditing && !baseUnitId) {
      setError('baseUnitId', {
        type: 'manual',
        message: 'L unite de base est requise',
      });
      return;
    }

    if (isEditing && (!stockItemId || !productId)) {
      setSnackbarMessage('Impossible de modifier ce produit: identifiant manquant.');
      return;
    }

    const submission: EnqueuePendingStockFormSubmissionInput = isEditing
      ? {
          mode: 'edit',
          stockItemId: stockItemId!,
          productId,
          productName,
          categoryId,
          quantity,
          lowThreshold,
          expirationDate,
          photo: selectedPhoto ?? undefined,
          quantityTypeId: quantityTypeId || undefined,
          baseUnitId: baseUnitId || undefined,
        }
      : {
          mode: 'create',
          productName,
          categoryId,
          quantityTypeId,
          baseUnitId,
          quantity,
          lowThreshold,
          expirationDate,
          photo: selectedPhoto ?? undefined,
        };

    const category = categoryById.get(categoryId);

    if (isOffline) {
      await enqueuePendingStockFormSubmission(submission);

      if (submission.mode === 'edit') {
        applyOptimisticEditUpdate(queryClient, {
          stockItemId: submission.stockItemId,
          productName: submission.productName,
          category,
          quantity: submission.quantity,
          lowThreshold: submission.lowThreshold,
          expirationDate: submission.expirationDate,
        });
      }

      await refreshPendingSubmissionsCount();
      await invalidateStockAndProductsQueries(queryClient);
      router.replace(STOCK_ROUTE);
      return;
    }

    try {
      await executeOnlineSubmission(submission);
      await invalidateStockAndProductsQueries(queryClient);
      await refreshPendingSubmissionsCount();
      router.replace(STOCK_ROUTE);
    } catch (error) {
      if (shouldQueueSubmissionError(error)) {
        await enqueuePendingStockFormSubmission(submission);

        if (submission.mode === 'edit') {
          applyOptimisticEditUpdate(queryClient, {
            stockItemId: submission.stockItemId,
            productName: submission.productName,
            category,
            quantity: submission.quantity,
            lowThreshold: submission.lowThreshold,
            expirationDate: submission.expirationDate,
          });
        }

        await refreshPendingSubmissionsCount();
        await invalidateStockAndProductsQueries(queryClient);
        router.replace(STOCK_ROUTE);
        return;
      }

      setSnackbarMessage(mapErrorToUi(error).message);
    }
  });

  const categories = categoriesQuery.data?.data ?? [];
  const quantityTypes = quantityTypesQuery.data?.data ?? [];
  const quantityUnits = unitsQuery.data?.data ?? [];

  const quantityTypeLabel =
    productQuery.data?.data.quantityType?.label ?? productQuery.data?.data.quantityType?.code ?? 'Non defini';

  const baseUnitLabel =
    productQuery.data?.data.baseUnit?.label ??
    productQuery.data?.data.baseUnit?.code ??
    stockItem?.product?.baseUnit?.label ??
    stockItem?.product?.baseUnit?.code ??
    'Non definie';

  const isLoadingData =
    categoriesQuery.isLoading ||
    (isEditing && stockItemsQuery.isLoading) ||
    (!isEditing && quantityTypesQuery.isLoading) ||
    (isEditing && Boolean(productId) && productQuery.isLoading);

  const hasLoadingError =
    categoriesQuery.isError ||
    (isEditing && stockItemsQuery.isError) ||
    (!isEditing && quantityTypesQuery.isError) ||
    (isEditing && Boolean(productId) && productQuery.isError);

  if (isEditing && !stockItemId) {
    return (
      <ScreenShell title="Modifier le produit">
        <View style={styles.centeredState}>
          <Text>Identifiant du produit manquant.</Text>
          <Button mode="outlined" onPress={() => router.replace(STOCK_ROUTE)}>
            Retour au stock
          </Button>
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      title={isEditing ? 'Modifier le produit' : 'Ajouter un produit'}
      subtitle={
        isEditing
          ? 'Mets a jour ton produit et son stock, meme sans connexion.'
          : 'Cree un produit puis ajoute-le a ton stock.'
      }>
      {isOffline ? (
        <Text style={styles.offlineText}>
          Tu es hors ligne: l enregistrement sera place en file et synchronise plus tard.
        </Text>
      ) : null}

      {pendingSubmissionsCount > 0 ? (
        <Card mode="outlined" style={styles.pendingCard}>
          <Card.Content style={styles.pendingCardContent}>
            <Text>{pendingSubmissionsCount} operation(s) formulaire en attente de synchronisation.</Text>
            {!isOffline ? (
              <Button
                mode="outlined"
                icon="sync"
                onPress={() => void handleFlushPendingSubmissions()}
                loading={isSyncingQueue}
                disabled={isSubmitting}>
                Synchroniser maintenant
              </Button>
            ) : null}
          </Card.Content>
        </Card>
      ) : null}

      {isLoadingData ? (
        <View style={styles.centeredState}>
          <ActivityIndicator size="small" />
          <Text>Chargement du formulaire...</Text>
        </View>
      ) : hasLoadingError ? (
        <View style={styles.centeredState}>
          <Text style={styles.errorText}>
            {mapErrorToUi(
              categoriesQuery.error ??
                stockItemsQuery.error ??
                quantityTypesQuery.error ??
                productQuery.error
            ).message}
          </Text>
          <Button mode="outlined" onPress={handleRetryLoading}>
            Reessayer
          </Button>
        </View>
      ) : isEditing && !stockItem ? (
        <View style={styles.centeredState}>
          <Text style={styles.errorText}>Ce produit n&apos;est plus disponible dans ton stock.</Text>
          <Button mode="outlined" onPress={() => router.replace(STOCK_ROUTE)}>
            Retour au stock
          </Button>
        </View>
      ) : isEditing && !productId ? (
        <View style={styles.centeredState}>
          <Text style={styles.errorText}>Impossible de modifier ce produit: identifiant introuvable.</Text>
          <Button mode="outlined" onPress={() => router.replace(STOCK_ROUTE)}>
            Retour au stock
          </Button>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Card style={styles.formCard}>
            <Card.Content style={styles.formCardContent}>
              <Controller
                control={control}
                name="productName"
                render={({ field: { value, onBlur, onChange } }) => (
                  <TextInput
                    mode="outlined"
                    label="Nom du produit"
                    value={value}
                    onBlur={onBlur}
                    onChangeText={onChange}
                    error={Boolean(formState.errors.productName)}
                  />
                )}
              />
              <HelperText type="error" visible={Boolean(formState.errors.productName)}>
                {formState.errors.productName?.message}
              </HelperText>

              <Text variant="labelLarge">Categorie</Text>
              <View style={styles.chipsContainer}>
                {categories.map((category) => {
                  if (!category.id) {
                    return null;
                  }

                  const isSelected = selectedCategoryId === category.id;

                  return (
                    <Chip
                      key={category.id}
                      selected={isSelected}
                      mode={isSelected ? 'flat' : 'outlined'}
                      onPress={() => {
                        setValue('categoryId', category.id!, {
                          shouldDirty: true,
                          shouldValidate: true,
                        });
                        clearErrors('categoryId');
                      }}>
                      {category.name}
                    </Chip>
                  );
                })}
              </View>
              <HelperText type="error" visible={Boolean(formState.errors.categoryId)}>
                {formState.errors.categoryId?.message}
              </HelperText>

              {isEditing ? (
                <>
                  <TextInput mode="outlined" label="Type de quantite" value={quantityTypeLabel} disabled />
                  <TextInput mode="outlined" label="Unite de base" value={baseUnitLabel} disabled />
                  <HelperText type="info" visible>
                    Le type de quantite et l unite sont fixes a la creation du produit.
                  </HelperText>
                </>
              ) : (
                <>
                  <Text variant="labelLarge">Type de quantite</Text>
                  <View style={styles.chipsContainer}>
                    {quantityTypes.map((type) => {
                      if (!type.id) {
                        return null;
                      }

                      const isSelected = selectedQuantityTypeId === type.id;

                      return (
                        <Chip
                          key={type.id}
                          selected={isSelected}
                          mode={isSelected ? 'flat' : 'outlined'}
                          onPress={() => {
                            setValue('quantityTypeId', type.id!, {
                              shouldDirty: true,
                              shouldValidate: true,
                            });
                            setValue('baseUnitId', '', {
                              shouldDirty: true,
                              shouldValidate: true,
                            });
                            clearErrors(['quantityTypeId', 'baseUnitId']);
                          }}>
                          {type.label ?? type.code}
                        </Chip>
                      );
                    })}
                  </View>
                  <HelperText type="error" visible={Boolean(formState.errors.quantityTypeId)}>
                    {formState.errors.quantityTypeId?.message}
                  </HelperText>

                  <Text variant="labelLarge">Unite de base</Text>
                  {selectedQuantityTypeId ? (
                    <View style={styles.chipsContainer}>
                      {quantityUnits.map((unit) => {
                        if (!unit.id) {
                          return null;
                        }

                        const isSelected = selectedBaseUnitId === unit.id;

                        return (
                          <Chip
                            key={unit.id}
                            selected={isSelected}
                            mode={isSelected ? 'flat' : 'outlined'}
                            onPress={() => {
                              setValue('baseUnitId', unit.id!, {
                                shouldDirty: true,
                                shouldValidate: true,
                              });
                              clearErrors('baseUnitId');
                            }}>
                            {unit.label ?? unit.code}
                          </Chip>
                        );
                      })}
                    </View>
                  ) : (
                    <Text style={styles.hintText}>Choisis un type de quantite pour afficher les unites.</Text>
                  )}
                  <HelperText type="error" visible={Boolean(formState.errors.baseUnitId)}>
                    {formState.errors.baseUnitId?.message}
                  </HelperText>
                </>
              )}

              <Controller
                control={control}
                name="quantity"
                render={({ field: { value, onBlur, onChange } }) => (
                  <TextInput
                    mode="outlined"
                    label="Quantite"
                    value={value}
                    onBlur={onBlur}
                    onChangeText={onChange}
                    keyboardType="decimal-pad"
                    error={Boolean(formState.errors.quantity)}
                  />
                )}
              />
              <HelperText type="error" visible={Boolean(formState.errors.quantity)}>
                {formState.errors.quantity?.message}
              </HelperText>

              <Controller
                control={control}
                name="lowThreshold"
                render={({ field: { value, onBlur, onChange } }) => (
                  <TextInput
                    mode="outlined"
                    label="Seuil bas (optionnel)"
                    value={value ?? ''}
                    onBlur={onBlur}
                    onChangeText={onChange}
                    keyboardType="decimal-pad"
                    error={Boolean(formState.errors.lowThreshold)}
                  />
                )}
              />
              <HelperText type="error" visible={Boolean(formState.errors.lowThreshold)}>
                {formState.errors.lowThreshold?.message}
              </HelperText>

              <Controller
                control={control}
                name="expirationDate"
                render={({ field: { value, onBlur, onChange } }) => (
                  <TextInput
                    mode="outlined"
                    label="Date d expiration (optionnel)"
                    placeholder="AAAA-MM-JJ"
                    value={value ?? ''}
                    onBlur={onBlur}
                    onChangeText={onChange}
                    error={Boolean(formState.errors.expirationDate)}
                  />
                )}
              />
              <HelperText type="error" visible={Boolean(formState.errors.expirationDate)}>
                {formState.errors.expirationDate?.message}
              </HelperText>

              <Card mode="outlined" style={styles.photoCard}>
                <Card.Content style={styles.photoContent}>
                  <Text variant="labelLarge">Photo (optionnel)</Text>

                  {selectedPhoto?.uri ? (
                    <Image source={{ uri: selectedPhoto.uri }} style={styles.photoPreview} resizeMode="cover" />
                  ) : (
                    <Text style={styles.hintText}>Aucune photo selectionnee.</Text>
                  )}

                  <View style={styles.photoButtonsRow}>
                    <Button
                      mode="outlined"
                      icon="image"
                      onPress={() => void handlePickPhoto()}
                      loading={isPickingPhoto}
                      disabled={isSubmitting}>
                      Choisir une photo
                    </Button>
                    {selectedPhoto?.uri ? (
                      <Button mode="text" onPress={() => setSelectedPhoto(null)} disabled={isSubmitting}>
                        Retirer
                      </Button>
                    ) : null}
                  </View>
                </Card.Content>
              </Card>

              <Button
                mode="contained"
                onPress={() => void handleSubmitForm()}
                loading={isSubmitting}
                disabled={isSubmitting}>
                {isEditing ? 'Enregistrer les modifications' : 'Ajouter au stock'}
              </Button>

              <Button
                mode="text"
                onPress={() => router.replace(STOCK_ROUTE)}
                disabled={isSubmitting}>
                Annuler
              </Button>
            </Card.Content>
          </Card>
        </ScrollView>
      )}

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
  },
  pendingCardContent: {
    gap: 10,
  },
  centeredState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 32,
  },
  errorText: {
    textAlign: 'center',
    color: '#D90429',
  },
  scrollContent: {
    paddingBottom: 24,
  },
  formCard: {
    borderRadius: 18,
    elevation: 1,
  },
  formCardContent: {
    gap: 8,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  hintText: {
    opacity: 0.75,
  },
  photoCard: {
    borderRadius: 14,
    elevation: 0,
  },
  photoContent: {
    gap: 10,
  },
  photoPreview: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    backgroundColor: '#E8ECEA',
  },
  photoButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
