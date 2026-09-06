import { Link, type Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Button, TextInput } from 'react-native-paper';

import { ScreenShell } from '@/components/ui/screen-shell';

const LOGIN_ROUTE = '/(auth)/login' as Href;

export default function ForgotPasswordScreen() {
  return (
    <ScreenShell title="Mot de passe oublie" subtitle="E00: ecran en attente d'integration E04.">
      <TextInput mode="outlined" label="Email" keyboardType="email-address" autoCapitalize="none" />
      <Button mode="contained" disabled>
        Envoyer le lien
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

