import { useLocalSearchParams } from 'expo-router';
import { Button, Text } from 'react-native-paper';

import { ScreenShell } from '@/components/ui/screen-shell';

export default function RecipeFormScreen() {
  const { recipeId } = useLocalSearchParams<{ recipeId?: string }>();
  const isEditing = Boolean(recipeId);

  return (
    <ScreenShell
      title={isEditing ? 'Modifier la recette' : 'Creer une recette'}
      subtitle="E11: ecran pret pour E13.">
      <Text>
        Le formulaire complet (nom, ingredients, quantites, etapes) sera implemente en E13.
      </Text>
      <Button mode="contained" disabled>
        Enregistrer
      </Button>
    </ScreenShell>
  );
}

