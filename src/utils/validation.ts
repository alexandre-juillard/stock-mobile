import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(1, 'Le mot de passe est requis'),
  rememberMe: z.boolean(),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  firstName: z.string().min(1, 'Le prenom est requis'),
  lastName: z.string().min(1, 'Le nom est requis'),
  email: z.string().email('Email invalide'),
  password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caracteres'),
});

export type RegisterFormValues = z.infer<typeof registerSchema>;

export const resendConfirmationSchema = z.object({
  email: z.string().email('Email invalide'),
});

export type ResendConfirmationFormValues = z.infer<typeof resendConfirmationSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().email('Email invalide'),
});

export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    newPassword: z
      .string()
      .min(8, 'Le mot de passe doit contenir au moins 8 caracteres'),
    confirmPassword: z.string().min(1, 'La confirmation du mot de passe est requise'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirmPassword'],
  });

export type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

const NON_NEGATIVE_NUMBER_PATTERN = /^\d+(?:[.,]\d+)?$/;
const POSITIVE_INTEGER_PATTERN = /^\d+$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const notificationSettingsSchema = z.object({
  expirationAlertDays: z
    .string()
    .trim()
    .min(1, 'Le delai d alerte est requis')
    .regex(POSITIVE_INTEGER_PATTERN, 'Renseigne un nombre entier positif')
    .transform((value) => Number.parseInt(value, 10))
    .refine((value) => value >= 1, {
      message: 'Le delai doit etre superieur ou egal a 1',
    }),
});

export type NotificationSettingsFormValues = z.input<typeof notificationSettingsSchema>;

export const stockFormSchema = z.object({
  productName: z
    .string()
    .trim()
    .min(1, 'Le nom du produit est requis'),
  categoryId: z.string().min(1, 'La categorie est requise'),
  quantityTypeId: z.string().optional(),
  baseUnitId: z.string().optional(),
  quantity: z
    .string()
    .trim()
    .min(1, 'La quantite est requise')
    .refine((value) => NON_NEGATIVE_NUMBER_PATTERN.test(value), {
      message: 'Renseigne une quantite valide (>= 0)',
    }),
  lowThreshold: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || NON_NEGATIVE_NUMBER_PATTERN.test(value), {
      message: 'Le seuil bas doit etre un nombre positif ou vide',
    }),
  expirationDate: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || ISO_DATE_PATTERN.test(value), {
      message: 'Utilise le format AAAA-MM-JJ',
    }),
});

export type StockFormValues = z.infer<typeof stockFormSchema>;

export const categoryFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Le nom de la categorie est requis'),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'La couleur doit etre au format HEX (#RRGGBB)'),
});

export type CategoryFormValues = z.infer<typeof categoryFormSchema>;

export const recipeIngredientFormSchema = z.object({
  productId: z.string().min(1, 'Le produit est requis'),
  productName: z.string().min(1, 'Le produit est requis'),
  quantity: z
    .string()
    .trim()
    .min(1, 'La quantite est requise')
    .refine((value) => NON_NEGATIVE_NUMBER_PATTERN.test(value), {
      message: 'Renseigne une quantite valide',
    })
    .refine((value) => Number.parseFloat(value.replace(',', '.')) > 0, {
      message: 'La quantite doit etre strictement positive',
    }),
  unitId: z.string().min(1, 'L unite est requise'),
  unitLabel: z.string().min(1, 'L unite est requise'),
});

export const recipeFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Le nom de la recette est requis')
    .max(200, 'Le nom est trop long (max 200 caracteres)'),
  ingredients: z
    .array(recipeIngredientFormSchema)
    .min(1, 'Ajoute au moins un ingredient'),
});

export type RecipeIngredientFormValues = z.infer<typeof recipeIngredientFormSchema>;
export type RecipeFormValues = z.infer<typeof recipeFormSchema>;


