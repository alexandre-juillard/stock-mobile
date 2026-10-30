import { View } from 'react-native';
import { ActivityIndicator } from 'react-native-paper';

import { makeStyles } from '@/hooks/use-app-theme';

export function FullScreenLoader() {
  const styles = useStyles();

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" accessibilityLabel="Chargement" />
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
}));