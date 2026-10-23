import { FilterDef, FilterValue } from '../../core/documents-models';
import { formatDate } from '../../shared/format';

/*
 * «Φίλτρα» in the URL: one parameter per filter, `c.<Key>`, so links stay readable.
 *   options, users, groups → c.Status=2,4
 *   dates                  → c.SendDate=2026-01-01~2026-02-28 (either side may be empty)
 *   text                   → c.Ada=ΨΩ12
 */

export const PARAM_PREFIX = 'c.';

const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

export function isEmptyValue(v: FilterValue | null | undefined): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return !v.trim();
  if (Array.isArray(v)) return v.length === 0;
  return !v.From && !v.To;
}

export function encodeValue(def: FilterDef, v: FilterValue | null | undefined): string | null {
  if (isEmptyValue(v)) return null;
  switch (def.Kind) {
    case 'dates': {
      const d = v as { From?: string | null; To?: string | null };
      return `${d.From ?? ''}~${d.To ?? ''}`;
    }
    case 'text':
      return (v as string).trim();
    default:
      return [...new Set(v as number[])].sort((a, b) => a - b).join(',');
  }
}

/** Raw URL value → typed value; anything malformed is dropped. */
export function decodeValue(def: FilterDef, raw: string | undefined): FilterValue | null {
  if (raw === undefined || raw === '') return null;
  switch (def.Kind) {
    case 'dates': {
      const [from = '', to = ''] = raw.split('~');
      const v = { From: isDate(from) ? from : null, To: isDate(to) ? to : null };
      return isEmptyValue(v) ? null : v;
    }
    case 'text':
      return raw.trim() || null;
    default: {
      let ids = raw.split(',').map(Number).filter((n) => Number.isInteger(n));
      if (def.Kind === 'options' && def.Options) ids = ids.filter((id) => def.Options!.some((o) => o.Id === id));
      if (def.Single) ids = ids.slice(0, 1);
      return ids.length ? ids : null;
    }
  }
}

/** Chip text: «Κατάσταση: Χρεώθηκε, Απαντήθηκε», «Ημ. Αποστολής: από 01/10/2026». */
export function describe(def: FilterDef, v: FilterValue, names: ReadonlyMap<string, string> = new Map()): string {
  switch (def.Kind) {
    case 'dates': {
      const d = v as { From?: string | null; To?: string | null };
      const range =
        d.From && d.To
          ? `${formatDate(d.From)} – ${formatDate(d.To)}`
          : d.From
            ? `από ${formatDate(d.From)}`
            : `έως ${formatDate(d.To)}`;
      return `${def.Label}: ${range}`;
    }
    case 'text':
      return `${def.Label}: «${v as string}»`;
    default: {
      const ids = v as number[];
      const label = (id: number) =>
        def.Kind === 'options'
          ? (def.Options?.find((o) => o.Id === id)?.Label ?? String(id))
          : (names.get(`${def.Kind === 'users' ? 'u' : 'g'}:${id}`) ?? `#${id}`);
      const shown = ids.slice(0, 2).map(label).join(', ');
      return `${def.Label}: ${shown}${ids.length > 2 ? ` +${ids.length - 2}` : ''}`;
    }
  }
}
