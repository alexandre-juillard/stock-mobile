import type { ComponentProps } from 'react';
import { Text } from 'react-native-paper';

import { makeStyles } from '@/hooks/use-app-theme';

type MutedTextProps = ComponentProps<typeof Text>;

/** Texte secondaire (aides, mentions hors ligne...) au contraste conforme WCAG AA. */
export function MutedText({ style, ...props }: MutedTextProps) {
  const styles = useStyles();
  return <Text {...props} style={[styles.text, style]} />;
}

const useStyles = makeStyles(({ colors }) => ({
  text: {
    color: colors.onSurfaceVariant,
  },
}));