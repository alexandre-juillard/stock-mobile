import type { QueryKey } from '@tanstack/react-query';

import { getGetCategoriesQueryKey } from '@/services/api/generated/catégories/catégories';
import { getListShoppingListQueryKey } from '@/services/api/generated/liste-de-courses/liste-de-courses';
import { getListProductsQueryKey } from '@/services/api/generated/produits/produits';
import { getGetRecipeQueryKey, getListRecipesQueryKey } from '@/services/api/generated/recettes/recettes';
import { getGetProfileQueryKey } from '@/services/api/generated/profil-utilisateur/profil-utilisateur';
import { getListExpiringSoonQueryKey, getListStockItemsQueryKey } from '@/services/api/generated/stock/stock';

type StockListParams = Parameters<typeof getListStockItemsQueryKey>[0];
type ProductListParams = Parameters<typeof getListProductsQueryKey>[0];

const recipesListKey = getListRecipesQueryKey();
const recipesListPath = recipesListKey[0];

export const queryKeys = {
  categories: {
    list: getGetCategoriesQueryKey(),
  },
  products: {
    list: (params?: ProductListParams) => getListProductsQueryKey(params),
    listPrefix: getListProductsQueryKey(),
  },
  profile: {
    detail: getGetProfileQueryKey(),
  },
  recipes: {
    list: recipesListKey,
    detail: (recipeId: string) => getGetRecipeQueryKey(recipeId),
  },
  shoppingList: {
    list: getListShoppingListQueryKey(),
  },
  stock: {
    list: (params?: StockListParams) => getListStockItemsQueryKey(params),
    listPrefix: getListStockItemsQueryKey(),
    expiring: getListExpiringSoonQueryKey(),
  },
} as const;

export function isRecipeDetailQueryKey(queryKey: QueryKey): boolean {
  const firstSegment = queryKey[0];

  return typeof firstSegment === 'string' && firstSegment.startsWith(`${recipesListPath}/`);
}

