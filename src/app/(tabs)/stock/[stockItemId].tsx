import { useLocalSearchParams } from 'expo-router';
import { Button, Text } from 'react-native-paper';

import { ScreenShell } from '@/components/ui/screen-shell';

export default function StockItemDetailScreen() {
  const { stockItemId } = useLocalSearchParams<{ stockItemId: string }>();

  return (
    <ScreenShell title="Détail produit" subtitle="E07: écran prêt pour E08.">
      <Text>
        Le détail complet (quantité, seuil, expiration, photo, actions rapides) de l&apos;article{' '}
        {stockItemId} sera implémenté en E08.
      </Text>
      <Button mode="contained" disabled>
        Modifier
      </Button>
    </ScreenShell>
  );
}

