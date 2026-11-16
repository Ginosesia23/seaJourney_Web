import {
  eachDayOfInterval,
  endOfYear,
  format,
  startOfDay,
  startOfYear,
  subDays,
} from 'date-fns';

import type { VesselAuditPeriod } from '@/lib/vessel-audit/types';

export function vesselAuditPeriodRange(period: VesselAuditPeriod): {
  from: Date | null;
  to: Date;
  fromIso: string | null;
  toIso: string;
} {
  const to = startOfDay(new Date());
  let from: Date | null = null;
  if (period === '30') from = subDays(to, 29);
  else if (period === '90') from = subDays(to, 89);
  else if (period === 'year') from = startOfYear(to);
  else from = null;

  const cappedTo =
    period === 'year' && endOfYear(to) < to ? endOfYear(to) : to;

  return {
    from,
    to: cappedTo,
    fromIso: from ? format(from, 'yyyy-MM-dd') : null,
    toIso: format(cappedTo, 'yyyy-MM-dd'),
  };
}

export function expectedDaysInRange(from: Date | null, to: Date, firstLogged?: string | null) {
  if (from) return eachDayOfInterval({ start: from, end: to }).length;
  if (firstLogged) {
    const start = startOfDay(new Date(`${firstLogged}T00:00:00`));
    if (!Number.isNaN(start.getTime()) && start <= to) {
      return eachDayOfInterval({ start, end: to }).length;
    }
  }
  return 0;
}

export function parsePeriod(raw: string | null): VesselAuditPeriod {
  if (raw === '30' || raw === '90' || raw === 'year' || raw === 'all') return raw;
  return '90';
}
