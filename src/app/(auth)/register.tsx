import { Link, type Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Button, TextInput } from 'react-native-paper';

import { ScreenShell } from '@/components/ui/screen-shell';

const LOGIN_ROUTE = '/(auth)/login' as Href;

export default function RegisterScreen() {
  return (
    <ScreenShell title="Inscription" subtitle="E00: structure d'ecran prete pour E02.">
      <TextInput mode="outlined" label="Prenom" />
      <TextInput mode="outlined" label="Nom" />
      <TextInput mode="outlined" label="Email" keyboardType="email-address" autoCapitalize="none" />
      <TextInput mode="outlined" label="Mot de passe" secureTextEntry />

      <Button mode="contained" disabled>
        Creer le compte
      </Button>

      <View style={styles.links}>
        <Link href={LOGIN_ROUTE} style={styles.link}>
          J&apos;ai deja un compte
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

