import { useLocalSearchParams } from 'expo-router';
import { Button, Text } from 'react-native-paper';

import { ScreenShell } from '@/components/ui/screen-shell';

export default function VerifyEmailPendingScreen() {
  const params = useLocalSearchParams<{ email?: string; pending?: string }>();
  const isPendingSync = params.pending === '1';

  return (
    <ScreenShell title="Verification email" subtitle="Ton compte est presque pret.">
      {params.email ? <Text>Email: {params.email}</Text> : null}
      {isPendingSync ? (
        <Text>
          Inscription en attente de synchronisation. Des que la connexion revient, le compte sera cree
          automatiquement.
        </Text>
      ) : (
        <Text>Verifie ta boite mail puis confirme ton compte.</Text>
      )}
      <Button mode="contained" disabled>
        Renvoyer l&apos;email
      </Button>
    </ScreenShell>
  );
}

