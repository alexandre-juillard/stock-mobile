import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { FlatList, View } from 'react-native';
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

import { DangerButton } from '@/components/ui/danger-button';
import { MutedText } from '@/components/ui/muted-text';
import { PendingSyncCard } from '@/components/ui/pending-sync-card';
import { ScreenShell } from '@/components/ui/screen-shell';
import { StateMessage } from '@/components/ui/state-message';
import { brandColors } from '@/constants/colors';
import { STOCK_ROUTE } from '@/constants/routes';
import { radius, spacing } from '@/constants/theme';
import { makeStyles } from '@/hooks/use-app-theme';
import { useIsOffline } from '@/hooks/use-is-offline';
import {
  useCreateCategory,
  useDeleteCategory,
  useGetCategories,
  useUpdateCategory,
} from '@/services/api/generated/catégories/catégories';
import type { CategoryResponse } from '@/services/api/generated/model';
import { queryKeys } from '@/services/api/query-keys';
import { invalidateCategoryRelatedQueries } from '@/services/api/query-invalidations';
import {
  enqueuePendingCategoryAction,
  flushPendingCategoryActions,
  getPendingCategoryActionsCount,
  type EnqueuePendingCategoryActionInput,
} from '@/services/offline/categories-queue';
import { shouldQueueAfterError } from '@/services/offline/offline-queue';
import { getReadableTextColor } from '@/utils/color-contrast';
import { mapErrorToUi } from '@/utils/error-mapper';
import { categoryFormSchema, type CategoryFormValues } from '@/utils/validation';

const DEFAULT_CATEGORY_COLOR = brandColors.green;

const CATEGORY_COLOR_PRESETS = [
  '#2D6A4F',
  '#F4A261',
  '#E9C46A',
  '#52B788',
  '#E76F51',
  '#5E60CE',
  '#4D908E',
  '#E5989B',
] as const;

const DEFAULT_FORM_VALUES: CategoryFormValues = {
  name: '',
  color: DEFAULT_CATEGORY_COLOR,
};

interface CategoriesResponseShape {
  data: CategoryResponse[];
}

type CategoryDialogMode = 'create' | 'edit';

function normalizeHexColor(value: string): string {
  return value.trim().toUpperCase();
}

function updateCategoryInResponse<T extends CategoriesResponseShape>(
  response: T | undefined,
  categoryId: string,
  payload: { name: string; color: string }
): T | undefined {
  if (!response) {
    return response;
  }

  let hasUpdated = false;
  const nextData = response.data.map((category) => {
    if (category.id !== categoryId) {
      return category;
    }

    hasUpdated = true;
    return {
      ...category,
      name: payload.name,
      color: payload.color,
    };
  });

  if (!hasUpdated) {
    return response;
  }

  return {
    ...response,
    data: nextData,
  };
}

function removeCategoryFromResponse<T extends CategoriesResponseShape>(
  response: T | undefined,
  categoryId: string
): T | undefined {
  if (!response) {
    return response;
  }

  const nextData = response.data.filter((category) => category.id !== categoryId);
  if (nextData.length === response.data.length) {
    return response;
  }

  return {
    ...response,
    data: nextData,
  };
}

function applyOptimisticCategoryUpdate(
  queryClient: QueryClient,
  categoryId: string,
  payload: { name: string; color: string }
): void {
  queryClient.setQueriesData<CategoriesResponseShape>(
    { queryKey: queryKeys.categories.list },
    (current) => updateCategoryInResponse(current, categoryId, payload)
  );
}

function applyOptimisticCategoryDelete(queryClient: QueryClient, categoryId: string): void {
  queryClient.setQueriesData<CategoriesResponseShape>(
    { queryKey: queryKeys.categories.list },
    (current) => removeCategoryFromResponse(current, categoryId)
  );
}

export default function CategoriesScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isOffline = useIsOffline();
  const styles = useStyles();

  const [dialogMode, setDialogMode] = useState<CategoryDialogMode | null>(null);
  const [editingCategory, setEditingCategory] = useState<CategoryResponse | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CategoryResponse | null>(null);
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);
  const [isSyncingQueue, setIsSyncingQueue] = useState(false);

  const categoriesQuery = useGetCategories();
  const createCategoryMutation = useCreateCategory();
  const updateCategoryMutation = useUpdateCategory();
  const deleteCategoryMutation = useDeleteCategory();

  const {
    data: pendingActionsCount = 0,
    refetch: refreshPendingActionsCount,
  } = useQuery({
    queryKey: ['offline-categories-actions-count'],
    queryFn: getPendingCategoryActionsCount,
  });

  const { control, handleSubmit, formState, reset, setValue, clearErrors } =
    useForm<CategoryFormValues>({
      resolver: zodResolver(categoryFormSchema),
      defaultValues: DEFAULT_FORM_VALUES,
    });

  const selectedColor = useWatch({ control, name: 'color' }) ?? DEFAULT_CATEGORY_COLOR;

  const isMutationPending =
    createCategoryMutation.isPending ||
    updateCategoryMutation.isPending ||
    deleteCategoryMutation.isPending;

  const isSubmitting = isMutationPending || isSyncingQueue;

  const categories = useMemo(() => {
    return [...(categoriesQuery.data?.data ?? [])].sort((first, second) => {
      return (first.name ?? '').localeCompare(second.name ?? '', 'fr', { sensitivity: 'base' });
    });
  }, [categoriesQuery.data]);

  const closeFormDialog = useCallback(() => {
    setDialogMode(null);
    setEditingCategory(null);
  }, []);

  const openCreateDialog = useCallback(() => {
    reset(DEFAULT_FORM_VALUES);
    setEditingCategory(null);
    setDialogMode('create');
  }, [reset]);

  const openEditDialog = useCallback(
    (category: CategoryResponse) => {
      if (!category.id) {
        return;
      }

      reset({
        name: category.name ?? '',
        color: normalizeHexColor(category.color ?? DEFAULT_CATEGORY_COLOR),
      });
      setEditingCategory(category);
      setDialogMode('edit');
    },
    [reset]
  );

  const handleRefresh = useCallback(async () => {
    await categoriesQuery.refetch();
    await refreshPendingActionsCount();
  }, [categoriesQuery, refreshPendingActionsCount]);

  const syncPendingActions = useCallback(async () => {
    if (isOffline || isSyncingQueue) {
      return;
    }

    setIsSyncingQueue(true);

    try {
      const result = await flushPendingCategoryActions({
        create: async (payload) => {
          await createCategoryMutation.mutateAsync({
            data: {
              name: payload.name,
              color: payload.color,
            },
          });
        },
        update: async (categoryId, payload) => {
          await updateCategoryMutation.mutateAsync({
            id: categoryId,
            data: {
              name: payload.name,
              color: payload.color,
            },
          });
        },
        delete: async (categoryId) => {
          await deleteCategoryMutation.mutateAsync({ id: categoryId });
        },
      });

      if (result.syncedCount > 0) {
        await invalidateCategoryRelatedQueries(queryClient);
      }

      await refreshPendingActionsCount();

      if (result.status === 'synced' && result.syncedCount > 0) {
        setSnackbarMessage(`${result.syncedCount} action(s) categories synchronisee(s).`);
      }

      if (result.status === 'retry_later' && result.retryCount > 0) {
        setSnackbarMessage(
          `${result.syncedCount} action(s) synchronisee(s), ${result.retryCount} encore en attente.`
        );
      }

      if (result.status === 'failed' && result.failedCount > 0) {
        setSnackbarMessage(`${result.failedCount} action(s) categories en echec.`);
      }
    } finally {
      setIsSyncingQueue(false);
    }
  }, [
    createCategoryMutation,
    deleteCategoryMutation,
    isOffline,
    isSyncingQueue,
    queryClient,
    refreshPendingActionsCount,
    updateCategoryMutation,
  ]);

  const submitCategoryForm = handleSubmit(async (values) => {
    const payload = {
      name: values.name.trim(),
      color: normalizeHexColor(values.color),
    };

    if (dialogMode === 'create') {
      const actionInput: EnqueuePendingCategoryActionInput = {
        type: 'create',
        payload,
      };

      if (isOffline) {
        await enqueuePendingCategoryAction(actionInput);
        await refreshPendingActionsCount();
        closeFormDialog();
        setSnackbarMessage('Categorie enregistree hors ligne. Synchronisation a venir.');
        return;
      }

      try {
        await createCategoryMutation.mutateAsync({ data: payload });
        await invalidateCategoryRelatedQueries(queryClient);
        closeFormDialog();
        setSnackbarMessage('Categorie creee.');
      } catch (error) {
        if (shouldQueueAfterError(error)) {
          await enqueuePendingCategoryAction(actionInput);
          await refreshPendingActionsCount();
          closeFormDialog();
          setSnackbarMessage('Reseau instable: creation en attente de synchronisation.');
          return;
        }

        setSnackbarMessage(mapErrorToUi(error).message);
      }

      return;
    }

    const categoryId = editingCategory?.id;
    if (!categoryId) {
      setSnackbarMessage('Categorie introuvable pour la modification.');
      return;
    }

    const actionInput: EnqueuePendingCategoryActionInput = {
      type: 'update',
      categoryId,
      payload,
    };

    if (isOffline) {
      applyOptimisticCategoryUpdate(queryClient, categoryId, payload);
      await enqueuePendingCategoryAction(actionInput);
      await refreshPendingActionsCount();
      closeFormDialog();
      setSnackbarMessage('Modification enregistree hors ligne.');
      return;
    }

    try {
      await updateCategoryMutation.mutateAsync({
        id: categoryId,
        data: payload,
      });
      await invalidateCategoryRelatedQueries(queryClient);
      closeFormDialog();
      setSnackbarMessage('Categorie mise a jour.');
    } catch (error) {
      if (shouldQueueAfterError(error)) {
        applyOptimisticCategoryUpdate(queryClient, categoryId, payload);
        await enqueuePendingCategoryAction(actionInput);
        await refreshPendingActionsCount();
        closeFormDialog();
        setSnackbarMessage('Reseau instable: modification en attente de synchronisation.');
        return;
      }

      await invalidateCategoryRelatedQueries(queryClient);
      setSnackbarMessage(mapErrorToUi(error).message);
    }
  });

  const handleDeleteCategory = useCallback(async () => {
    const categoryId = deleteTarget?.id;
    if (!categoryId) {
      setDeleteTarget(null);
      return;
    }

    const actionInput: EnqueuePendingCategoryActionInput = {
      type: 'delete',
      categoryId,
    };

    if (isOffline) {
      applyOptimisticCategoryDelete(queryClient, categoryId);
      await enqueuePendingCategoryAction(actionInput);
      await refreshPendingActionsCount();
      setDeleteTarget(null);
      setSnackbarMessage('Suppression enregistree hors ligne.');
      return;
    }

    try {
      await deleteCategoryMutation.mutateAsync({ id: categoryId });
      await invalidateCategoryRelatedQueries(queryClient);
      setDeleteTarget(null);
      setSnackbarMessage('Categorie supprimee.');
    } catch (error) {
      if (shouldQueueAfterError(error)) {
        applyOptimisticCategoryDelete(queryClient, categoryId);
        await enqueuePendingCategoryAction(actionInput);
        await refreshPendingActionsCount();
        setDeleteTarget(null);
        setSnackbarMessage('Reseau instable: suppression en attente de synchronisation.');
        return;
      }

      await invalidateCategoryRelatedQueries(queryClient);
      setDeleteTarget(null);
      setSnackbarMessage(mapErrorToUi(error).message);
    }
  }, [
    deleteCategoryMutation,
    deleteTarget,
    isOffline,
    queryClient,
    refreshPendingActionsCount,
  ]);

  const renderCategoryItem = useCallback(
    ({ item }: { item: CategoryResponse }) => {
      if (!item.id) {
        return null;
      }

      return (
        <Card mode="outlined" style={styles.categoryCard}>
          <Card.Content style={styles.categoryCardContent}>
            <View style={styles.categoryIdentity}>
              <View style={[styles.colorDot, { backgroundColor: item.color ?? DEFAULT_CATEGORY_COLOR }]} />
              <View style={styles.categoryLabelBlock}>
                <Text variant="titleMedium">{item.name ?? 'Categorie sans nom'}</Text>
                <MutedText>{item.color ?? DEFAULT_CATEGORY_COLOR}</MutedText>
              </View>
            </View>

            <View style={styles.categoryActionsRow}>
              <Button mode="outlined" icon="pencil" onPress={() => openEditDialog(item)} disabled={isSubmitting}>
                Modifier
              </Button>
              <DangerButton
                mode="outlined"
                icon="delete-outline"
                onPress={() => setDeleteTarget(item)}
                disabled={isSubmitting}>
                Supprimer
              </DangerButton>
            </View>
          </Card.Content>
        </Card>
      );
    },
    [isSubmitting, openEditDialog, styles]
  );

  return (
    <ScreenShell
      title="Categories"
      subtitle="Cree, modifie et supprime tes categories sans quitter cet ecran.">
      <Button mode="text" icon="arrow-left" onPress={() => router.push(STOCK_ROUTE)} disabled={isSubmitting}>
        Retour au stock
      </Button>

      {isOffline ? <MutedText>Tu es hors ligne: les changements seront synchronises ensuite.</MutedText> : null}

      {pendingActionsCount > 0 ? (
        <PendingSyncCard
          messages={[`${pendingActionsCount} action(s) categories en attente.`]}
          canSync={!isOffline}
          onSync={() => void syncPendingActions()}
          isSyncing={isSyncingQueue}
          disabled={isSubmitting}
        />
      ) : null}

      {categoriesQuery.isLoading ? (
        <StateMessage message="Chargement des categories..." />
      ) : categoriesQuery.isError ? (
        <StateMessage tone="error" icon="alert-circle-outline" message={mapErrorToUi(categoriesQuery.error).message}>
          <Button mode="outlined" onPress={() => void handleRefresh()}>
            Reessayer
          </Button>
        </StateMessage>
      ) : categories.length === 0 ? (
        <StateMessage icon="shape-outline" message="Aucune categorie pour le moment.">
          <Button mode="contained" onPress={openCreateDialog} disabled={isSubmitting}>
            Creer une categorie
          </Button>
        </StateMessage>
      ) : (
        <FlatList
          data={categories}
          keyExtractor={(item, index) => item.id ?? `${item.name ?? 'category'}-${index}`}
          renderItem={renderCategoryItem}
          style={styles.list}
          contentContainerStyle={styles.listContent}
        />
      )}

      <Portal>
        <Dialog visible={dialogMode !== null} onDismiss={closeFormDialog}>
          <Dialog.Title>{dialogMode === 'edit' ? 'Modifier la categorie' : 'Creer une categorie'}</Dialog.Title>
          <Dialog.Content style={styles.dialogContent}>
            <Controller
              control={control}
              name="name"
              render={({ field: { value, onBlur, onChange } }) => (
                <TextInput
                  mode="outlined"
                  label="Nom"
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

            <Controller
              control={control}
              name="color"
              render={({ field: { value, onBlur, onChange } }) => (
                <TextInput
                  mode="outlined"
                  label="Couleur HEX"
                  value={value}
                  onBlur={onBlur}
                  onChangeText={(text) => onChange(text.toUpperCase())}
                  autoCapitalize="characters"
                  error={Boolean(formState.errors.color)}
                  right={<TextInput.Affix text={selectedColor} />}
                />
              )}
            />
            <HelperText type="error" visible={Boolean(formState.errors.color)}>
              {formState.errors.color?.message}
            </HelperText>

            <Text variant="labelLarge">Suggestions</Text>
            <View style={styles.colorChipsRow}>
              {CATEGORY_COLOR_PRESETS.map((colorValue) => {
                const isSelected = normalizeHexColor(selectedColor) === colorValue;

                return (
                  <Chip
                    key={colorValue}
                    selected={isSelected}
                    mode={isSelected ? 'flat' : 'outlined'}
                    onPress={() => {
                      setValue('color', colorValue, {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                      clearErrors('color');
                    }}
                    selectedColor={getReadableTextColor(colorValue)}
                    style={[styles.colorChip, { backgroundColor: colorValue }]}>
                    {colorValue}
                  </Chip>
                );
              })}
            </View>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={closeFormDialog} disabled={isSubmitting}>
              Annuler
            </Button>
            <Button onPress={() => void submitCategoryForm()} loading={isSubmitting} disabled={isSubmitting}>
              Enregistrer
            </Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={Boolean(deleteTarget)} onDismiss={() => setDeleteTarget(null)}>
          <Dialog.Title>Supprimer cette categorie ?</Dialog.Title>
          <Dialog.Content>
            <Text>
              Les produits relies conserveront leur categorie actuelle tant que la synchronisation n&apos;a
              pas abouti.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDeleteTarget(null)} disabled={isSubmitting}>
              Annuler
            </Button>
            <DangerButton
              onPress={() => void handleDeleteCategory()}
              loading={deleteCategoryMutation.isPending}
              disabled={isSubmitting}>
              Supprimer
            </DangerButton>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <FAB icon="plus" style={styles.fab} label="Nouvelle categorie" onPress={openCreateDialog} />

      <Snackbar visible={Boolean(snackbarMessage)} onDismiss={() => setSnackbarMessage(null)} duration={4500}>
        {snackbarMessage}
      </Snackbar>
    </ScreenShell>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  list: {
    flex: 1,
  },
  listContent: {
    gap: spacing.sm + 2,
    paddingBottom: 96,
  },
  categoryCard: {
    borderRadius: radius.card,
    borderColor: colors.outlineVariant,
  },
  categoryCardContent: {
    gap: spacing.sm + 2,
  },
  categoryIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    flex: 1,
  },
  categoryLabelBlock: {
    flex: 1,
    gap: 2,
  },
  // La bordure garde la pastille visible quelle que soit la couleur choisie.
  colorDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.outline,
  },
  categoryActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm + 2,
  },
  dialogContent: {
    gap: spacing.sm,
  },
  colorChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  colorChip: {
    borderColor: colors.outline,
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
  },
}));
