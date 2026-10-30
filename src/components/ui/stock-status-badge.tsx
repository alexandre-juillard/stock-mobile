import { StatusBadge, type IconName } from '@/components/ui/status-badge';
import type { StatusTone } from '@/constants/colors';
import { StockItemResponseStatus } from '@/services/api/generated/model';

interface StockStatusBadgeProps {
  status: StockItemResponseStatus;
}

// Libellés et tons alignés sur docs/screens.md (système d'expiration).
const STATUS_VISUALS: Record<StockItemResponseStatus, { label: string; icon: IconName; tone: StatusTone }> = {
  ok: { label: 'Frais', icon: 'check-circle-outline', tone: 'success' },
  low: { label: 'Stock bas', icon: 'tray-alert', tone: 'caution' },
  expiring: { label: 'À consommer rapidement !', icon: 'alert-outline', tone: 'warning' },
  expired: { label: 'Périmé', icon: 'close-circle', tone: 'danger' },
};

export function StockStatusBadge({ status }: StockStatusBadgeProps) {
  return <StatusBadge {...STATUS_VISUALS[status]} />;
}
