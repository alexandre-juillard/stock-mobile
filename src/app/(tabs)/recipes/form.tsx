import { Button, Text } from 'react-native-paper';

import { ScreenShell } from '@/components/ui/screen-shell';

export default function RecipeFormScreen() {
  return (
    <ScreenShell title="Creer une recette" subtitle="E11: ecran pret pour E13.">
      <Text>
        Le formulaire complet (nom, ingredients, quantites, etapes) sera implemente en E13.
      </Text>
      <Button mode="contained" disabled>
        Enregistrer
      </Button>
    </ScreenShell>
  );
}

