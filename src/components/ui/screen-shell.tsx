import type { PropsWithChildren } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from 'react-native-paper';

import { spacing } from '@/constants/theme';
import { makeStyles } from '@/hooks/use-app-theme';

interface ScreenShellProps extends PropsWithChildren {
  title: string;
  subtitle?: string;
}

export function ScreenShell({ title, subtitle, children }: ScreenShellProps) {
  const styles = useStyles();

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.container}>
        <Text variant="headlineMedium" style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        {children}
      </View>
    </SafeAreaView>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    gap: spacing.md,
  },
  title: {
    color: colors.onBackground,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.onSurfaceVariant,
  },
}));