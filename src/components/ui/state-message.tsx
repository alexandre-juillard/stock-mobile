import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from 'react-native-paper';

import type { IconName } from '@/components/ui/status-badge';
import { spacing } from '@/constants/theme';
import { makeStyles } from '@/hooks/use-app-theme';

interface StateMessageProps {
  message: string;
  icon?: IconName;
  tone?: 'neutral' | 'error';
  /** Actions affichées sous le message (ex. bouton « Réessayer »). */
  children?: ReactNode;
}

/** État plein écran centré : chargement, erreur ou liste vide. */
export function StateMessage({ message, icon, tone = 'neutral', children }: StateMessageProps) {
  const styles = useStyles();
  const toneStyle = tone === 'error' ? styles.error : styles.neutral;

  return (
    <View style={styles.container} accessibilityLiveRegion={tone === 'error' ? 'polite' : 'none'}>
      {icon ? <MaterialCommunityIcons name={icon} size={32} style={toneStyle} /> : null}
      <Text style={[styles.message, toneStyle]}>{message}</Text>
      {children}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  message: {
    textAlign: 'center',
  },
  neutral: {
    color: colors.onSurfaceVariant,
  },
  error: {
    color: colors.error,
  },
}));