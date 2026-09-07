import { useLocalSearchParams } from 'expo-router';
import { Button, Text } from 'react-native-paper';

import { ScreenShell } from '@/components/ui/screen-shell';

export default function RecipeDetailScreen() {
  const { recipeId } = useLocalSearchParams<{ recipeId: string }>();

  return (
    <ScreenShell title="Detail recette" subtitle="E11: ecran pret pour E12.">
      <Text>
        Le detail complet (ingredients dispo/non dispo, consommation, suppression, ajout aux courses)
        de la recette {recipeId} sera implemente en E12.
      </Text>
      <Button mode="contained" disabled>
        Consommer la recette
      </Button>
    </ScreenShell>
  );
}

