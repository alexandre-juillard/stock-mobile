import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

export type RecipeFeasibilityStatus = 'ready' | 'missing' | 'unknown';

interface RecipeFeasibilityBadgeProps {
  status: RecipeFeasibilityStatus;
  missingCount?: number;
}

interface FeasibilityVisual {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  backgroundColor: string;
  textColor: string;
  getLabel: (missingCount?: number) => string;
}

const FEASIBILITY_VISUALS: Record<RecipeFeasibilityStatus, FeasibilityVisual> = {
  ready: {
    icon: 'check-circle-outline',
    backgroundColor: '#D8F3DC',
    textColor: '#081C15',
    getLabel: () => 'Realisable',
  },
  missing: {
    icon: 'alert-outline',
    backgroundColor: '#E9C46A',
    textColor: '#081C15',
    getLabel: (missingCount) =>
      missingCount && missingCount > 1
        ? `${missingCount} ingredients manquants`
        : missingCount === 1
          ? '1 ingredient manquant'
          : 'Ingredients manquants',
  },
  unknown: {
    icon: 'help-circle-outline',
    backgroundColor: '#D8DBE2',
    textColor: '#1F2933',
    getLabel: () => 'Statut indisponible',
  },
};

export function RecipeFeasibilityBadge({ status, missingCount }: RecipeFeasibilityBadgeProps) {
  const visual = FEASIBILITY_VISUALS[status];

  return (
    <View style={[styles.container, { backgroundColor: visual.backgroundColor }]}>
      <MaterialCommunityIcons name={visual.icon} size={14} color={visual.textColor} />
      <Text style={[styles.label, { color: visual.textColor }]}>{visual.getLabel(missingCount)}</Text>
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

