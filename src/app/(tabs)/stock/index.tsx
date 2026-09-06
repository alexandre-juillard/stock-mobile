import { Button, Text } from 'react-native-paper';

import { ScreenShell } from '@/components/ui/screen-shell';

export default function StockListScreen() {
  return (
    <ScreenShell title="Mon stock" subtitle="E00: ecran d'accueil V1 en place.">
      <Text>La liste de stock sera implementee en E07 avec filtres, recherche et alertes expiration.</Text>
      <Button mode="contained" disabled>
        Ajouter un produit
      </Button>
    </ScreenShell>
  );
}

