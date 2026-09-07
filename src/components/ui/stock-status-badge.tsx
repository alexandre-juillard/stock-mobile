import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import { StockItemResponseStatus } from '@/services/api/generated/model';

interface StockStatusBadgeProps {
  status: StockItemResponseStatus;
}

interface StatusVisual {
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  backgroundColor: string;
  textColor: string;
}

// Palette et libellés alignés sur docs/screens.md — jamais la couleur seule (WCAG 1.4.1),
// toujours une icône + un libellé texte accompagnant chaque état.
const STATUS_VISUALS: Record<StockItemResponseStatus, StatusVisual> = {
  ok: {
    label: 'Frais',
    icon: 'check-circle-outline',
    backgroundColor: '#D8F3DC',
    textColor: '#081C15',
  },
  low: {
    label: 'Stock bas',
    icon: 'tray-alert',
    backgroundColor: '#F4A261',
    textColor: '#081C15',
  },
  expiring: {
    label: 'À consommer rapidement !',
    icon: 'alert-outline',
    backgroundColor: '#E9C46A',
    textColor: '#081C15',
  },
  expired: {
    label: 'Périmé',
    icon: 'close-circle',
    backgroundColor: '#D90429',
    textColor: '#FFFFFF',
  },
};

export function StockStatusBadge({ status }: StockStatusBadgeProps) {
  const visual = STATUS_VISUALS[status];

  return (
    <View style={[styles.container, { backgroundColor: visual.backgroundColor }]}>
      <MaterialCommunityIcons name={visual.icon} size={14} color={visual.textColor} />
      <Text style={[styles.label, { color: visual.textColor }]}>{visual.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  label: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
});

