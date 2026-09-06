import { useLocalSearchParams } from 'expo-router';
import { Button, Text } from 'react-native-paper';

import { ScreenShell } from '@/components/ui/screen-shell';

export default function OAuth2LinkConfirmationScreen() {
  const params = useLocalSearchParams<{ linkContext?: string }>();

  return (
    <ScreenShell title="Liaison de compte" subtitle="E00: ecran en attente d'integration E06.">
      <Text>Un compte local existe deja avec cet email. Veux-tu le lier avec Google ?</Text>
      <Text variant="bodySmall">linkContext: {params.linkContext ?? 'non fourni'}</Text>
      <Button mode="contained" disabled>
        Lier mon compte
      </Button>
      <Button mode="outlined" disabled>
        Garder des comptes separes
      </Button>
    </ScreenShell>
  );
}

