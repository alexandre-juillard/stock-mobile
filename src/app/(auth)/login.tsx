import { Link, type Href } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Checkbox, Text, TextInput } from 'react-native-paper';

import { ScreenShell } from '@/components/ui/screen-shell';

const REGISTER_ROUTE = '/(auth)/register' as Href;
const FORGOT_PASSWORD_ROUTE = '/(auth)/forgot-password' as Href;

export default function LoginScreen() {
  const [rememberMe, setRememberMe] = useState(false);

  return (
    <ScreenShell
      title="Connexion"
      subtitle="E00: squelette d'ecran en place. L'integration API arrive en E01.">
      <TextInput mode="outlined" label="Email" keyboardType="email-address" autoCapitalize="none" />
      <TextInput mode="outlined" label="Mot de passe" secureTextEntry />

      <View style={styles.row}>
        <Checkbox status={rememberMe ? 'checked' : 'unchecked'} onPress={() => setRememberMe((v) => !v)} />
        <Text>Se souvenir de moi</Text>
      </View>

      <Button mode="contained" disabled>
        Se connecter
      </Button>

      <Button mode="outlined" disabled>
        Continuer avec Google
      </Button>

      <View style={styles.links}>
        <Link href={REGISTER_ROUTE} style={styles.link}>
          Creer un compte
        </Link>
        <Link href={FORGOT_PASSWORD_ROUTE} style={styles.link}>
          Mot de passe oublie
        </Link>
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  links: {
    marginTop: 8,
    gap: 8,
  },
  link: {
    color: '#2D6A4F',
  },
});

