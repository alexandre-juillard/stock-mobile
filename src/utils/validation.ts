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
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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


