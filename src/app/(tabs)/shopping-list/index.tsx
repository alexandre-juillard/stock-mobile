import { Text } from 'react-native-paper';

import { ScreenShell } from '@/components/ui/screen-shell';

export default function ShoppingListScreen() {
  return (
    <ScreenShell title="Liste de courses" subtitle="E00: ecran pret pour E14.">
      <Text>
        Les actions check/uncheck/finaliser seront branchees au backend lors de l&apos;etape metier.
      </Text>
    </ScreenShell>
  );
}

