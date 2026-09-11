import { zodResolver } from '@hookform/resolvers/zod';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNetInfo } from '@react-native-community/netinfo';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  Button,
  Card,
  Chip,
  Dialog,
  HelperText,
  Portal,
  Snackbar,
  Text,
  TextInput,
} from 'react-native-paper';

import { ScreenShell } from '@/components/ui/screen-shell';
import type {
  ProductResponse,
  RecipeDetailResponse,
} from '@/services/api/generated/model';
import { useListProducts } from '@/services/api/generated/produits/produits';
import {
  addIngredient,
  createRecipe,
  deleteIngredient,
  getRecipe,
  updateIngredient,
  updateRecipe,
  useGetRecipe,
} from '@/services/api/generated/recettes/recettes';
import { useGetUnitsByType } from '@/services/api/generated/référentiel-quantités/référentiel-quantités';
import { useListStockItems } from '@/services/api/generated/stock/stock';
import { ApiClientError } from '@/services/api/http-client';
import {
  enqueuePendingRecipeFormSubmission,
  flushPendingRecipeFormSubmissions,
  getPendingRecipeFormSubmissionsCount,
  type EnqueuePendingRecipeFormSubmissionInput,
  type PendingRecipeFormSubmission,
  type RecipeFormSubmissionIngredient,
} from '@/services/offline/recipe-form-submissions-queue';
import { invalidateRecipeFormQueries } from '@/services/api/query-invalidations';
import { mapErrorToUi } from '@/utils/error-mapper';
import {
  recipeFormSchema,
  type RecipeFormValues,
  type RecipeIngredientFormValues,
} from '@/utils/validation';

const RECIPES_ROUTE = '/(tabs)/recipes' as Href;

const DEFAULT_RECIPE_FORM_VALUES: RecipeFormValues = {
  name: '',
  ingredients: [],
};

interface IngredientDialogState {
  index: number | null;
  productId: string;
  quantity: string;
  unitId: string;
  unitLabel: string;
  productSearchQuery: string;
  errorMessage: string | null;
}

interface UnitOption {
  id: string;
  label: string;
}

function getFirstRouteParamValue(param: string | string[] | undefined): string | null {
  if (!param) {
    return null;
  }

  return Array.isArray(param) ? (param[0] ?? null) : param;
}

function parseQuantityInput(value: string): number {
  return Number.parseFloat(value.replace(',', '.'));
}

function formatQuantityValue(value: number): string {
  return new Intl.NumberFormat('fr-FR', {
    maximumFractionDigits: 3,
  }).format(value);
}

function toRecipeFormValuesFromDetail(recipeDetail: RecipeDetailResponse): RecipeFormValues {
  const ingredients: RecipeIngredientFormValues[] = (recipeDetail.ingredients ?? [])
    .map((ingredient) => {
      const productId = ingredient.product?.id ?? '';
      const productName = ingredient.product?.name ?? '';
      const unitId = ingredient.unit?.id ?? '';
      const unitLabel = ingredient.unit?.label ?? ingredient.unit?.code ?? '';
      const quantityValue =
        typeof ingredient.quantity === 'number' && Number.isFinite(ingredient.quantity)
          ? ingredient.quantity
          : Number.NaN;

      if (!productId || !productName || !unitId || !unitLabel || !Number.isFinite(quantityValue)) {
        return null;
      }

      return {
        productId,
        productName,
        quantity: quantityValue.toString(),
        unitId,
        unitLabel,
      };
    })
    .filter((item): item is RecipeIngredientFormValues => item !== null);

  return {
    name: recipeDetail.name ?? '',
    ingredients,
  };
}

function shouldQueueSubmissionAfterError(error: unknown): boolean {
  return !(error instanceof ApiClientError && error.status >= 400 && error.status < 500);
}

function areQuantitiesEquivalent(first: number, second: number): boolean {
  return Math.abs(first - second) < 0.0001;
}

function toSubmissionPayload(
  formValues: RecipeFormValues,
  isEditing: boolean,
  recipeId: string | null
): EnqueuePendingRecipeFormSubmissionInput {
  const ingredients: RecipeFormSubmissionIngredient[] = formValues.ingredients.map((ingredient) => ({
    productId: ingredient.productId,
    quantity: parseQuantityInput(ingredient.quantity),
    unitId: ingredient.unitId,
  }));

  if (isEditing && recipeId) {
    return {
      mode: 'edit',
      recipeId,
      name: formValues.name.trim(),
      ingredients,
    };
  }

  return {
    mode: 'create',
    name: formValues.name.trim(),
    ingredients,
  };
}

async function executeRecipeFormSubmissionOnline(
  submission: PendingRecipeFormSubmission | EnqueuePendingRecipeFormSubmissionInput
): Promise<string | null> {
  if (submission.mode === 'create') {
    const createResponse = await createRecipe({
      name: submission.name,
      ingredients: submission.ingredients,
    });

    return createResponse.data.id ?? null;
  }

  const recipeId = submission.recipeId;

  await updateRecipe(recipeId, {
    name: submission.name,
  });

  const currentDetailResponse = await getRecipe(recipeId);
  const currentIngredients = currentDetailResponse.data.ingredients ?? [];

  const currentByProductId = new Map<string, { quantity: number; unitId: string }>();

  for (const ingredient of currentIngredients) {
    const productId = ingredient.product?.id;
    const unitId = ingredient.unit?.id;
    const quantity =
      typeof ingredient.quantity === 'number' && Number.isFinite(ingredient.quantity)
        ? ingredient.quantity
        : null;

    if (!productId || !unitId || quantity === null) {
      continue;
    }

    currentByProductId.set(productId, {
      quantity,
      unitId,
    });
  }

  const targetByProductId = new Map<string, RecipeFormSubmissionIngredient>();

  for (const ingredient of submission.ingredients) {
    targetByProductId.set(ingredient.productId, ingredient);

    const currentIngredient = currentByProductId.get(ingredient.productId);
    if (!currentIngredient) {
      await addIngredient(recipeId, {
        productId: ingredient.productId,
        quantity: ingredient.quantity,
        unitId: ingredient.unitId,
      });
      continue;
    }

    const hasUnitChanged = currentIngredient.unitId !== ingredient.unitId;
    const hasQuantityChanged = !areQuantitiesEquivalent(currentIngredient.quantity, ingredient.quantity);

    if (hasUnitChanged || hasQuantityChanged) {
      await updateIngredient(recipeId, ingredient.productId, {
        quantity: ingredient.quantity,
        unitId: ingredient.unitId,
      });
    }
  }

  for (const [productId] of currentByProductId.entries()) {
    if (targetByProductId.has(productId)) {
      continue;
    }

    await deleteIngredient(recipeId, productId);
  }

  return recipeId;
}

function toUnitOptions(
  selectedProduct: ProductResponse | null,
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

  const baseUnitId = selectedProduct?.baseUnit?.id;
  if (!baseUnitId) {
    return [];
  }

  return [
    {
      id: baseUnitId,
      label: selectedProduct?.baseUnit?.label ?? selectedProduct?.baseUnit?.code ?? baseUnitId,
    },
  ];
}

export default function RecipeFormScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const netInfo = useNetInfo();

  const { recipeId: recipeIdParam } = useLocalSearchParams<{ recipeId?: string | string[] }>();
  const recipeId = useMemo(() => getFirstRouteParamValue(recipeIdParam), [recipeIdParam]);
  const isEditing = Boolean(recipeId);

  const isOffline = netInfo.isConnected === false || netInfo.isInternetReachable === false;

  const [ingredientDialog, setIngredientDialog] = useState<IngredientDialogState | null>(null);
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);
  const [isSubmittingRecipe, setIsSubmittingRecipe] = useState(false);
  const [isSyncingQueue, setIsSyncingQueue] = useState(false);

  const recipeQuery = useGetRecipe(recipeId ?? '', {
    query: {
      enabled: isEditing && Boolean(recipeId),
    },
  });
  const productsQuery = useListProducts({ visible: true });
  const stockItemsQuery = useListStockItems();

  const {
    data: pendingSubmissionsCount = 0,
    refetch: refreshPendingSubmissionsCount,
  } = useQuery({
    queryKey: ['offline-recipe-form-submissions-count'],
    queryFn: getPendingRecipeFormSubmissionsCount,
  });

  const initialFormValues = useMemo<RecipeFormValues>(() => {
    if (!isEditing) {
      return DEFAULT_RECIPE_FORM_VALUES;
    }

    if (!recipeQuery.data?.data) {
      return {
        name: '',
        ingredients: [],
      };
    }

    return toRecipeFormValuesFromDetail(recipeQuery.data.data);
  }, [isEditing, recipeQuery.data]);

  const { control, handleSubmit, formState, setError, clearErrors } = useForm<RecipeFormValues>({
    resolver: zodResolver(recipeFormSchema),
    values: initialFormValues,
  });

  const { fields, append, update, remove } = useFieldArray({
    control,
    name: 'ingredients',
  });

  const watchedIngredientsValue = useWatch({ control, name: 'ingredients' });
  const watchedIngredients = useMemo(
    () => watchedIngredientsValue ?? [],
    [watchedIngredientsValue]
  );

  const stockProductIds = useMemo(() => {
    return new Set(
      (stockItemsQuery.data?.data ?? [])
        .map((stockItem) => stockItem.product?.id)
        .filter((productId): productId is string => Boolean(productId))
    );
  }, [stockItemsQuery.data]);

  const selectableProducts = useMemo(() => {
    const hasStockSnapshot = stockItemsQuery.data !== undefined;
    const products = productsQuery.data?.data ?? [];

    return products
      .filter((product) => Boolean(product.id) && Boolean(product.name))
      .filter((product) => !hasStockSnapshot || stockProductIds.has(product.id!))
      .sort((first, second) => {
        return (first.name ?? '').localeCompare(second.name ?? '', 'fr', { sensitivity: 'base' });
      });
  }, [productsQuery.data, stockItemsQuery.data, stockProductIds]);

  const selectableProductsById = useMemo(() => {
    const map = new Map<string, ProductResponse>();

    for (const product of selectableProducts) {
      if (!product.id) {
        continue;
      }

      map.set(product.id, product);
    }

    return map;
  }, [selectableProducts]);

  const selectedIngredientProductId = ingredientDialog?.productId ?? '';

  const selectedIngredientProduct = useMemo(() => {
    if (!selectedIngredientProductId) {
      return null;
    }

    return selectableProductsById.get(selectedIngredientProductId) ?? null;
  }, [selectableProductsById, selectedIngredientProductId]);

  const selectedIngredientQuantityTypeId = selectedIngredientProduct?.quantityType?.id ?? '';

  const unitsByTypeQuery = useGetUnitsByType(selectedIngredientQuantityTypeId, {
    query: {
      enabled: Boolean(ingredientDialog) && Boolean(selectedIngredientQuantityTypeId),
    },
  });

  const unitOptions = useMemo(() => {
    return toUnitOptions(selectedIngredientProduct, unitsByTypeQuery.data?.data);
  }, [selectedIngredientProduct, unitsByTypeQuery.data]);

  const filteredProductOptions = useMemo(() => {
    if (!ingredientDialog) {
      return [];
    }

    const normalizedSearch = ingredientDialog.productSearchQuery.trim().toLowerCase();

    return selectableProducts.filter((product) => {
      if (!product.id) {
        return false;
      }

      const isUsedByAnotherIngredient = watchedIngredients.some((ingredient, index) => {
        if (index === ingredientDialog.index) {
          return false;
        }

        return ingredient.productId === product.id;
      });

      if (isUsedByAnotherIngredient) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      return (product.name ?? '').toLowerCase().includes(normalizedSearch);
    });
  }, [ingredientDialog, selectableProducts, watchedIngredients]);

  const isSubmitting = isSubmittingRecipe || isSyncingQueue;

  const openAddIngredientDialog = useCallback(() => {
    setIngredientDialog({
      index: null,
      productId: '',
      quantity: '',
      unitId: '',
      unitLabel: '',
      productSearchQuery: '',
      errorMessage: null,
    });
  }, []);

  const openEditIngredientDialog = useCallback(
    (index: number) => {
      const ingredient = watchedIngredients[index];
      if (!ingredient) {
        return;
      }

      setIngredientDialog({
        index,
        productId: ingredient.productId,
        quantity: ingredient.quantity,
        unitId: ingredient.unitId,
        unitLabel: ingredient.unitLabel,
        productSearchQuery: '',
        errorMessage: null,
      });
    },
    [watchedIngredients]
  );

  const closeIngredientDialog = useCallback(() => {
    setIngredientDialog(null);
  }, []);

  const handleSelectIngredientProduct = useCallback(
    (product: ProductResponse) => {
      if (!product.id) {
        return;
      }

      const defaultUnitId = product.baseUnit?.id ?? '';
      const defaultUnitLabel = product.baseUnit?.label ?? product.baseUnit?.code ?? '';

      setIngredientDialog((currentDialog) => {
        if (!currentDialog) {
          return currentDialog;
        }

        return {
          ...currentDialog,
          productId: product.id!,
          unitId: defaultUnitId,
          unitLabel: defaultUnitLabel,
          errorMessage: null,
        };
      });

      clearErrors('ingredients');
    },
    [clearErrors]
  );

  const handleSelectIngredientUnit = useCallback((unitId: string, unitLabel: string) => {
    setIngredientDialog((currentDialog) => {
      if (!currentDialog) {
        return currentDialog;
      }

      return {
        ...currentDialog,
        unitId,
        unitLabel,
        errorMessage: null,
      };
    });
  }, []);

  const handleSaveIngredientDialog = useCallback(() => {
    if (!ingredientDialog) {
      return;
    }

    const productId = ingredientDialog.productId;
    if (!productId) {
      setIngredientDialog((currentDialog) => {
        if (!currentDialog) {
          return currentDialog;
        }

        return {
          ...currentDialog,
          errorMessage: 'Choisis un produit',
        };
      });
      return;
    }

    const quantityNumber = parseQuantityInput(ingredientDialog.quantity);
    if (!Number.isFinite(quantityNumber) || quantityNumber <= 0) {
      setIngredientDialog((currentDialog) => {
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

    const unitId = ingredientDialog.unitId;
    if (!unitId) {
      setIngredientDialog((currentDialog) => {
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

    const duplicateIngredient = watchedIngredients.some((ingredient, index) => {
      if (index === ingredientDialog.index) {
        return false;
      }

      return ingredient.productId === productId;
    });

    if (duplicateIngredient) {
      setIngredientDialog((currentDialog) => {
        if (!currentDialog) {
          return currentDialog;
        }

        return {
          ...currentDialog,
          errorMessage: 'Ce produit est deja dans la recette',
        };
      });
      return;
    }

    const selectedProduct = selectableProductsById.get(productId);
    const selectedUnit = unitOptions.find((unitOption) => unitOption.id === unitId);
    const resolvedUnitLabel =
      selectedUnit?.label ??
      ingredientDialog.unitLabel ??
      selectedProduct?.baseUnit?.label ??
      selectedProduct?.baseUnit?.code ??
      unitId;

    const nextIngredient: RecipeIngredientFormValues = {
      productId,
      productName: selectedProduct?.name ?? 'Produit inconnu',
      quantity: quantityNumber.toString(),
      unitId,
      unitLabel: resolvedUnitLabel,
    };

    if (ingredientDialog.index === null) {
      append(nextIngredient);
    } else {
      update(ingredientDialog.index, nextIngredient);
    }

    clearErrors('ingredients');
    setIngredientDialog(null);
  }, [append, clearErrors, ingredientDialog, selectableProductsById, unitOptions, update, watchedIngredients]);

  const handleRemoveIngredient = useCallback(
    (index: number) => {
      remove(index);
      clearErrors('ingredients');
    },
    [clearErrors, remove]
  );

  const handleSyncPendingSubmissions = useCallback(async () => {
    if (isOffline || isSyncingQueue) {
      return;
    }

    setIsSyncingQueue(true);

    try {
      const result = await flushPendingRecipeFormSubmissions(async (submission) => {
        await executeRecipeFormSubmissionOnline(submission);
      });

      if (result.syncedCount > 0) {
        await invalidateRecipeFormQueries(queryClient);
      }

      await refreshPendingSubmissionsCount();

      if (result.status === 'retry_later' && result.retryCount > 0) {
        setSnackbarMessage(
          `${result.syncedCount} soumission(s) synchronisee(s), ${result.retryCount} encore en attente.`
        );
        return;
      }

      if (result.status === 'failed' && result.failedCount > 0) {
        setSnackbarMessage(`${result.failedCount} soumission(s) en echec lors de la synchronisation.`);
        return;
      }

      if (result.status === 'synced' && result.syncedCount > 0) {
        setSnackbarMessage(`${result.syncedCount} soumission(s) hors ligne synchronisee(s).`);
      }
    } finally {
      setIsSyncingQueue(false);
    }
  }, [isOffline, isSyncingQueue, queryClient, refreshPendingSubmissionsCount]);

  const handleSubmitRecipe = handleSubmit(async (values) => {
    if (isEditing && !recipeId) {
      setSnackbarMessage('Identifiant recette manquant.');
      return;
    }

    if (values.ingredients.length === 0) {
      setError('ingredients', {
        type: 'manual',
        message: 'Ajoute au moins un ingredient',
      });
      return;
    }

    const submissionInput = toSubmissionPayload(values, isEditing, recipeId);

    if (isOffline) {
      await enqueuePendingRecipeFormSubmission(submissionInput);
      await refreshPendingSubmissionsCount();
      setSnackbarMessage('Recette enregistree hors ligne. Synchronisation plus tard.');
      router.replace(RECIPES_ROUTE);
      return;
    }

    setIsSubmittingRecipe(true);

    try {
      await executeRecipeFormSubmissionOnline(submissionInput);
      await invalidateRecipeFormQueries(queryClient);
      await refreshPendingSubmissionsCount();
      router.replace(RECIPES_ROUTE);
    } catch (error) {
      if (shouldQueueSubmissionAfterError(error)) {
        await enqueuePendingRecipeFormSubmission(submissionInput);
        await refreshPendingSubmissionsCount();
        setSnackbarMessage('Reseau instable: soumission placee en file hors ligne.');
        router.replace(RECIPES_ROUTE);
        return;
      }

      setSnackbarMessage(mapErrorToUi(error).message);
    } finally {
      setIsSubmittingRecipe(false);
    }
  });

  const handleRefreshData = useCallback(async () => {
    await Promise.all([
      productsQuery.refetch(),
      stockItemsQuery.refetch(),
      refreshPendingSubmissionsCount(),
      isEditing ? recipeQuery.refetch() : Promise.resolve(),
    ]);
  }, [isEditing, productsQuery, recipeQuery, refreshPendingSubmissionsCount, stockItemsQuery]);

  const isLoadingData =
    productsQuery.isLoading ||
    stockItemsQuery.isLoading ||
    (isEditing && recipeQuery.isLoading);

  const hasLoadingError =
    productsQuery.isError ||
    stockItemsQuery.isError ||
    (isEditing && recipeQuery.isError);

  return (
    <ScreenShell
      title={isEditing ? 'Modifier la recette' : 'Creer une recette'}
      subtitle="Definis le nom et les ingredients de ta recette.">
      {isOffline ? (
        <Text style={styles.offlineText}>
          Tu es hors ligne: les changements sont enregistres puis synchronises ensuite.
        </Text>
      ) : null}

      {pendingSubmissionsCount > 0 ? (
        <Card mode="outlined" style={styles.pendingCard}>
          <Card.Content style={styles.pendingCardContent}>
            <Text>{pendingSubmissionsCount} soumission(s) recette en attente.</Text>
            {!isOffline ? (
              <Button
                mode="outlined"
                icon="sync"
                onPress={() => void handleSyncPendingSubmissions()}
                loading={isSyncingQueue}
                disabled={isSubmitting}>
                Synchroniser
              </Button>
            ) : null}
          </Card.Content>
        </Card>
      ) : null}

      {isLoadingData ? (
        <View style={styles.centeredState}>
          <Text>Chargement du formulaire...</Text>
        </View>
      ) : hasLoadingError ? (
        <View style={styles.centeredState}>
          <MaterialCommunityIcons name="alert-circle-outline" size={32} color="#D90429" />
          <Text style={styles.errorText}>
            {mapErrorToUi(productsQuery.error ?? stockItemsQuery.error ?? recipeQuery.error).message}
          </Text>
          <Button mode="outlined" onPress={() => void handleRefreshData()}>
            Reessayer
          </Button>
        </View>
      ) : isEditing && !recipeQuery.data?.data ? (
        <View style={styles.centeredState}>
          <Text style={styles.errorText}>Recette introuvable.</Text>
          <Button mode="outlined" onPress={() => router.replace(RECIPES_ROUTE)}>
            Retour aux recettes
          </Button>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Card style={styles.formCard}>
            <Card.Content style={styles.formCardContent}>
              <Controller
                control={control}
                name="name"
                render={({ field: { value, onBlur, onChange } }) => (
                  <TextInput
                    mode="outlined"
                    label="Nom de la recette"
                    value={value}
                    onBlur={onBlur}
                    onChangeText={onChange}
                    error={Boolean(formState.errors.name)}
                  />
                )}
              />
              <HelperText type="error" visible={Boolean(formState.errors.name)}>
                {formState.errors.name?.message}
              </HelperText>

              <View style={styles.ingredientsHeader}>
                <Text variant="titleMedium">Ingredients</Text>
                <Button mode="text" icon="plus" onPress={openAddIngredientDialog} disabled={isSubmitting}>
                  Ajouter
                </Button>
              </View>

              {fields.length === 0 ? (
                <Text style={styles.emptyIngredientsText}>Ajoute ton premier ingredient.</Text>
              ) : (
                fields.map((field, index) => {
                  const ingredient = watchedIngredients[index];
                  if (!ingredient) {
                    return null;
                  }

                  return (
                    <Card key={field.id} mode="outlined" style={styles.ingredientCard}>
                      <Card.Content style={styles.ingredientCardContent}>
                        <View style={styles.ingredientMainRow}>
                          <View style={styles.ingredientTextBlock}>
                            <Text variant="titleMedium">{ingredient.productName}</Text>
                            <Text style={styles.ingredientMetaText}>
                              {formatQuantityValue(parseQuantityInput(ingredient.quantity))} {ingredient.unitLabel}
                            </Text>
                          </View>
                          <MaterialCommunityIcons name="food-variant" size={18} color="#60646C" />
                        </View>

                        <View style={styles.ingredientActionsRow}>
                          <Button
                            mode="outlined"
                            icon="pencil"
                            onPress={() => openEditIngredientDialog(index)}
                            disabled={isSubmitting}>
                            Modifier
                          </Button>
                          <Button
                            mode="outlined"
                            icon="delete-outline"
                            textColor="#D90429"
                            onPress={() => handleRemoveIngredient(index)}
                            disabled={isSubmitting}>
                            Retirer
                          </Button>
                        </View>
                      </Card.Content>
                    </Card>
                  );
                })
              )}

              <HelperText type="error" visible={Boolean(formState.errors.ingredients?.message)}>
                {formState.errors.ingredients?.message}
              </HelperText>

              <Button
                mode="contained"
                onPress={() => void handleSubmitRecipe()}
                loading={isSubmitting}
                disabled={isSubmitting}>
                {isEditing ? 'Enregistrer les modifications' : 'Creer la recette'}
              </Button>

              <Button mode="text" onPress={() => router.replace(RECIPES_ROUTE)} disabled={isSubmitting}>
                Annuler
              </Button>
            </Card.Content>
          </Card>
        </ScrollView>
      )}

      <Portal>
        <Dialog visible={Boolean(ingredientDialog)} onDismiss={closeIngredientDialog}>
          <Dialog.Title>{ingredientDialog?.index === null ? 'Ajouter un ingredient' : 'Modifier un ingredient'}</Dialog.Title>
          <Dialog.Content style={styles.dialogContent}>
            <TextInput
              mode="outlined"
              label="Rechercher un produit"
              value={ingredientDialog?.productSearchQuery ?? ''}
              onChangeText={(text) => {
                setIngredientDialog((currentDialog) => {
                  if (!currentDialog) {
                    return currentDialog;
                  }

                  return {
                    ...currentDialog,
                    productSearchQuery: text,
                  };
                });
              }}
            />

            <View style={styles.optionsWrap}>
              {filteredProductOptions.length === 0 ? (
                <Text style={styles.hintText}>Aucun produit disponible pour ce filtre.</Text>
              ) : (
                filteredProductOptions.map((product) => {
                  if (!product.id) {
                    return null;
                  }

                  const isSelected = ingredientDialog?.productId === product.id;

                  return (
                    <Chip
                      key={product.id}
                      selected={isSelected}
                      mode={isSelected ? 'flat' : 'outlined'}
                      onPress={() => handleSelectIngredientProduct(product)}>
                      {product.name}
                    </Chip>
                  );
                })
              )}
            </View>

            <TextInput
              mode="outlined"
              label="Quantite"
              keyboardType="decimal-pad"
              value={ingredientDialog?.quantity ?? ''}
              onChangeText={(text) => {
                setIngredientDialog((currentDialog) => {
                  if (!currentDialog) {
                    return currentDialog;
                  }

                  return {
                    ...currentDialog,
                    quantity: text,
                  };
                });
              }}
            />

            <Text variant="labelLarge">Unite</Text>
            {!ingredientDialog?.productId ? (
              <Text style={styles.hintText}>Choisis un produit pour afficher les unites.</Text>
            ) : unitsByTypeQuery.isLoading ? (
              <Text style={styles.hintText}>Chargement des unites...</Text>
            ) : unitsByTypeQuery.isError ? (
              <Text style={styles.errorText}>Impossible de charger les unites pour ce produit.</Text>
            ) : (
              <View style={styles.optionsWrap}>
                {unitOptions.map((unitOption) => {
                  const isSelected = ingredientDialog?.unitId === unitOption.id;

                  return (
                    <Chip
                      key={unitOption.id}
                      selected={isSelected}
                      mode={isSelected ? 'flat' : 'outlined'}
                      onPress={() => handleSelectIngredientUnit(unitOption.id, unitOption.label)}>
                      {unitOption.label}
                    </Chip>
                  );
                })}
              </View>
            )}

            {ingredientDialog?.errorMessage ? (
              <HelperText type="error" visible>
                {ingredientDialog.errorMessage}
              </HelperText>
            ) : null}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={closeIngredientDialog}>Annuler</Button>
            <Button onPress={handleSaveIngredientDialog}>Valider</Button>
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
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
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
  ingredientsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  emptyIngredientsText: {
    opacity: 0.8,
  },
  ingredientCard: {
    borderRadius: 14,
    elevation: 0,
  },
  ingredientCardContent: {
    gap: 8,
  },
  ingredientMainRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  ingredientTextBlock: {
    flex: 1,
    gap: 2,
  },
  ingredientMetaText: {
    opacity: 0.8,
  },
  ingredientActionsRow: {
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
});

