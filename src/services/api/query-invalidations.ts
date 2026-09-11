import type { QueryClient } from '@tanstack/react-query';

import { isRecipeDetailQueryKey, queryKeys } from '@/services/api/query-keys';

export async function invalidateStockQueries(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.stock.listPrefix }),
    queryClient.invalidateQueries({ queryKey: queryKeys.stock.expiring }),
  ]);
}

export async function invalidateStockAndProductsQueries(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    invalidateStockQueries(queryClient),
    queryClient.invalidateQueries({ queryKey: queryKeys.products.listPrefix }),
  ]);
}

export async function invalidateCategoryRelatedQueries(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.categories.list }),
    invalidateStockQueries(queryClient),
  ]);
}

export async function invalidateShoppingListQueries(
  queryClient: QueryClient,
  includeStockQueries: boolean
): Promise<void> {
  const invalidations: Promise<void>[] = [
    queryClient.invalidateQueries({ queryKey: queryKeys.shoppingList.list }),
  ];

  if (includeStockQueries) {
    invalidations.push(invalidateStockQueries(queryClient));
  }

  await Promise.all(invalidations);
}

export async function invalidateProfileQueries(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: queryKeys.profile.detail });
}

export async function invalidateRecipeRelatedQueries(
  queryClient: QueryClient,
  recipeId: string
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.recipes.list }),
    queryClient.invalidateQueries({ queryKey: queryKeys.recipes.detail(recipeId) }),
    invalidateStockQueries(queryClient),
    queryClient.invalidateQueries({ queryKey: queryKeys.shoppingList.list }),
  ]);
}

export async function invalidateRecipeFormQueries(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.recipes.list }),
    queryClient.invalidateQueries({
      predicate: ({ queryKey }) => isRecipeDetailQueryKey(queryKey),
    }),
  ]);
}

