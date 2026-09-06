import { Text } from 'react-native-paper';

import { ScreenShell } from '@/components/ui/screen-shell';

export default function RecipesListScreen() {
  return (
    <ScreenShell title="Recettes" subtitle="E00: ecran pret pour E11.">
      <Text>La liste des recettes et le statut realisable avec ton stock arrivent ensuite.</Text>
    </ScreenShell>
  );
}

