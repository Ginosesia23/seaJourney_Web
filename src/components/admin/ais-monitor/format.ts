import { format, formatDistanceToNowStrict, parseISO } from 'date-fns';

export function fmtNumber(n: number | null | undefined): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-GB').format(n);
}

export function fmtPercent(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${n % 1 === 0 ? n.toFixed(0) : n.toFixed(1)}%`;
}

export function fmtMs(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)} s`;
  return `${Math.round(n)} ms`;
}

export function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return 'Never';
  try {
    return formatDistanceToNowStrict(parseISO(iso), { addSuffix: true });
  } catch {
    return iso;
  }
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), 'dd MMM yyyy, HH:mm:ss');
  } catch {
    return iso;
  }
}

export function fmtShortTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), 'dd MMM HH:mm:ss');
  } catch {
    return iso;
  }
}

export function humanizeToken(value: string | null | undefined): string {
  if (!value) return '—';
  return value.replace(/[_-]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}
