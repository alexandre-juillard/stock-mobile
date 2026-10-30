import type { ComponentProps } from 'react';
import { Button } from 'react-native-paper';

import { useAppTheme } from '@/hooks/use-app-theme';

type DangerButtonProps = Omit<ComponentProps<typeof Button>, 'buttonColor' | 'textColor'>;

/** Bouton d'action destructive (suppression, consommation...) aux couleurs d'erreur du thème. */
export function DangerButton({ mode = 'text', ...props }: DangerButtonProps) {
  const { colors } = useAppTheme();
  const isFilled = mode === 'contained';

  return (
    <Button
      {...props}
      mode={mode}
      buttonColor={isFilled ? colors.error : undefined}
      textColor={isFilled ? colors.onError : colors.error}
    />
  );
}
