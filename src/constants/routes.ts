import type { Href } from 'expo-router';

export const LOGIN_ROUTE = '/(auth)/login' as Href;
export const REGISTER_ROUTE = '/(auth)/register' as Href;
export const FORGOT_PASSWORD_ROUTE = '/(auth)/forgot-password' as Href;
export const VERIFY_EMAIL_ROUTE = '/(auth)/verify-email-pending' as Href;
export const OAUTH_LINK_ROUTE = '/(auth)/oauth2-link-confirmation' as Href;

export const STOCK_ROUTE = '/(tabs)/stock' as Href;
export const STOCK_FORM_ROUTE = '/(tabs)/stock/form' as Href;
export const CATEGORIES_ROUTE = '/(tabs)/categories' as Href;
export const RECIPES_ROUTE = '/(tabs)/recipes' as Href;
export const RECIPE_FORM_ROUTE = '/(tabs)/recipes/form' as Href;
export const NOTIFICATIONS_ROUTE = '/(tabs)/profile/notifications' as Href;

export function buildStockItemRoute(stockItemId: string): Href {
  return `/(tabs)/stock/${stockItemId}` as Href;
}

export function buildStockFormRoute(stockItemId: string): Href {
  return `/(tabs)/stock/form?stockItemId=${encodeURIComponent(stockItemId)}` as Href;
}

export function buildRecipeDetailRoute(recipeId: string): Href {
  return `/(tabs)/recipes/${recipeId}` as Href;
}

export function buildRecipeFormRoute(recipeId: string): Href {
  return `/(tabs)/recipes/form?recipeId=${encodeURIComponent(recipeId)}` as Href;
}
