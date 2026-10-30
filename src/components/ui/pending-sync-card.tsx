import type { ReactNode } from 'react';
import { Button, Card, Text } from 'react-native-paper';

import { radius, spacing } from '@/constants/theme';
import { makeStyles } from '@/hooks/use-app-theme';

interface PendingSyncCardProps {
  /** Une ligne par file d'attente concernée ; les valeurs vides sont ignorées. */
  messages: (string | false | null | undefined)[];
  onSync: () => void;
  /** Masque le bouton (ex. hors ligne : la synchronisation est impossible). */
  canSync: boolean;
  isSyncing: boolean;
  disabled?: boolean;
  syncLabel?: string;
}

export function PendingSyncCard({
  messages,
  onSync,
  canSync,
  isSyncing,
  disabled,
  syncLabel = 'Synchroniser',
}: PendingSyncCardProps): ReactNode {
  const styles = useStyles();

  return (
    <Card mode="outlined" style={styles.card}>
      <Card.Content style={styles.content}>
        {messages.filter(Boolean).map((message) => (
          <Text key={message as string}>{message}</Text>
        ))}
        {canSync ? (
          <Button mode="outlined" icon="sync" onPress={onSync} loading={isSyncing} disabled={disabled}>
            {syncLabel}
          </Button>
        ) : null}
      </Card.Content>
    </Card>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  card: {
    borderRadius: radius.card,
    borderColor: colors.outlineVariant,
  },
  content: {
    gap: spacing.sm,
  },
}));
