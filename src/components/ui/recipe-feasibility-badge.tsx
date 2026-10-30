import { StatusBadge, type IconName } from '@/components/ui/status-badge';
import type { StatusTone } from '@/constants/colors';

export type RecipeFeasibilityStatus = 'ready' | 'missing' | 'unknown';

interface RecipeFeasibilityBadgeProps {
  status: RecipeFeasibilityStatus;
  missingCount?: number;
}

const FEASIBILITY_VISUALS: Record<RecipeFeasibilityStatus, { icon: IconName; tone: StatusTone }> = {
  ready: { icon: 'check-circle-outline', tone: 'success' },
  missing: { icon: 'alert-outline', tone: 'warning' },
  unknown: { icon: 'help-circle-outline', tone: 'neutral' },
};

function getFeasibilityLabel(status: RecipeFeasibilityStatus, missingCount?: number): string {
  if (status === 'ready') {
    return 'Realisable';
  }

  if (status === 'unknown') {
    return 'Statut indisponible';
  }

  if (missingCount && missingCount > 1) {
    return `${missingCount} ingredients manquants`;
  }

  return missingCount === 1 ? '1 ingredient manquant' : 'Ingredients manquants';
}

export function RecipeFeasibilityBadge({ status, missingCount }: RecipeFeasibilityBadgeProps) {
  return <StatusBadge {...FEASIBILITY_VISUALS[status]} label={getFeasibilityLabel(status, missingCount)} />;
}