import { MaterialCommunityIcons } from '@expo/vector-icons';
import { View } from 'react-native';
import { Text } from 'react-native-paper';

import type { StatusTone } from '@/constants/colors';
import { radius, spacing } from '@/constants/theme';
import { makeStyles, useAppTheme } from '@/hooks/use-app-theme';

export type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

interface StatusBadgeProps {
  tone: StatusTone;
  icon: IconName;
  label: string;
}

// Jamais la couleur seule (WCAG 1.4.1) : chaque statut a une icône et un libellé.
export function StatusBadge({ tone, icon, label }: StatusBadgeProps) {
  const { status } = useAppTheme();
  const styles = useStyles();
  const { container, onContainer } = status[tone];

  return (
    <View style={[styles.container, { backgroundColor: container }]}>
      <MaterialCommunityIcons name={icon} size={14} style={{ color: onContainer }} />
      <Text variant="labelMedium" style={{ color: onContainer }}>
        {label}
      </Text>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.badge,
  },
}));
