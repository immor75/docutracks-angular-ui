/** Formatting helpers shared by list and detail. Pure functions, no Angular. */

const dateFmt = new Intl.DateTimeFormat('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('el-GR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** Accepts ISO strings, .NET `/Date(1655905399023-0000)/` and `dd/mm/yyyy`. */
export function parseDate(v: string | number | null | undefined): Date | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return new Date(v);
  const dotnet = /\/Date\((-?\d+)/.exec(v);
  if (dotnet) return new Date(Number(dotnet[1]));
  const dmy = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(v);
  if (dmy) return new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
  const d = new Date(v);
  return Number.isNaN(d.getTime()) || d.getFullYear() < 1900 ? null : d;
}

export function formatDate(v: string | number | null | undefined, withTime = false): string {
  const d = parseDate(v);
  return d ? (withTime ? dateTimeFmt : dateFmt).format(d) : '—';
}

export type StatusKind = 'created' | 'progress' | 'archived' | 'other';

export function statusKind(status: string | null | undefined): StatusKind {
  const s = (status ?? '').toLocaleLowerCase('el');
  if (s.startsWith('δημιουργ')) return 'created';
  if (s.startsWith('σε εξέλιξη')) return 'progress';
  if (s.startsWith('αρχειοθ')) return 'archived';
  return 'other';
}

export function personName(u: { DisplayName?: string; FirstName?: string; LastName?: string } | null | undefined): string {
  if (!u) return '';
  return u.DisplayName || [u.FirstName, u.LastName].filter(Boolean).join(' ');
}

export function dash(v: string | null | undefined): string {
  return v && v.trim() && v.trim() !== '-' ? v : '—';
}

/** «1,2 MB», «40 KB». */
export function fileSize(bytes: number | null | undefined): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}
