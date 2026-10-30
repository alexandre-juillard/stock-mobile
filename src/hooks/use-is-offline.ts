import { useNetInfo } from '@react-native-community/netinfo';

/**
 * Hors ligne uniquement si NetInfo l'affirme explicitement : un état encore
 * inconnu (`null`) est considéré comme en ligne.
 */
export function useIsOffline(): boolean {
  const { isConnected, isInternetReachable } = useNetInfo();
  return isConnected === false || isInternetReachable === false;
}
