import { Button, Text } from 'react-native-paper';

import { ScreenShell } from '@/components/ui/screen-shell';

export default function NotificationSettingsScreen() {
  return (
    <ScreenShell title="Notifications" subtitle="E00: ecran pret pour E16.">
      <Text>
        Le reglage du delai d&apos;alerte expiration sera connecte a l&apos;API lors de l&apos;etape
        metier.
      </Text>
      <Button mode="contained" disabled>
        Enregistrer
      </Button>
    </ScreenShell>
  );
}

