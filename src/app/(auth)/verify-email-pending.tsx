import { Button, Text } from 'react-native-paper';

import { ScreenShell } from '@/components/ui/screen-shell';

export default function VerifyEmailPendingScreen() {
  return (
    <ScreenShell title="Verification email" subtitle="E00: ecran en attente d'integration E03.">
      <Text>Verifie ta boite mail puis confirme ton compte.</Text>
      <Button mode="contained" disabled>
        Renvoyer l&apos;email
      </Button>
    </ScreenShell>
  );
}

