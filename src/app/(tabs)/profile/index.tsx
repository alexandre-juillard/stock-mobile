import { Link, type Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import { ScreenShell } from '@/components/ui/screen-shell';

const NOTIFICATIONS_ROUTE = '/(tabs)/profile/notifications' as Href;

export default function ProfileScreen() {
  return (
    <ScreenShell title="Profil" subtitle="E00: ecran pret pour E15.">
      <Text>Les preferences compte/theme/langue seront branchees apres le flux Stock/Recettes/Courses.</Text>

      <View style={styles.links}>
        <Link href={NOTIFICATIONS_ROUTE} style={styles.link}>
          Parametres de notifications
        </Link>
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  links: {
    marginTop: 8,
  },
  link: {
    color: '#2D6A4F',
  },
});

