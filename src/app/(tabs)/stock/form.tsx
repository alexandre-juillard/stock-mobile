import { useLocalSearchParams } from 'expo-router';
import { Button, Text } from 'react-native-paper';

import { ScreenShell } from '@/components/ui/screen-shell';

export default function StockItemFormScreen() {
  const { stockItemId } = useLocalSearchParams<{ stockItemId?: string }>();
  const isEditing = Boolean(stockItemId);

  return (
    <ScreenShell
      title={isEditing ? 'Modifier le produit' : 'Ajouter un produit'}
      subtitle="E07: écran prêt pour E09.">
      <Text>
        Le formulaire complet (produit, catégorie, quantité, unité, seuil, expiration, photo) sera
        implémenté en E09.
      </Text>
      <Button mode="contained" disabled>
        Enregistrer
      </Button>
    </ScreenShell>
  );
}

