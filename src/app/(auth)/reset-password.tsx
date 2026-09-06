import { Link, type Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Button, TextInput } from 'react-native-paper';

import { ScreenShell } from '@/components/ui/screen-shell';

const LOGIN_ROUTE = '/(auth)/login' as Href;

export default function ResetPasswordScreen() {
  return (
    <ScreenShell title="Nouveau mot de passe" subtitle="E00: ecran en attente d'integration E05.">
      <TextInput mode="outlined" label="Nouveau mot de passe" secureTextEntry />
      <TextInput mode="outlined" label="Confirmer le mot de passe" secureTextEntry />
      <Button mode="contained" disabled>
        Valider
      </Button>

      <View style={styles.links}>
        <Link href={LOGIN_ROUTE} style={styles.link}>
          Retour a la connexion
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

