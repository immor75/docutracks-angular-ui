import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { FormioInput } from '../editor/editor-models';
import { FieldValue, Row, parseMetadata } from '../editor/metadata-xml';
import { formatDate } from '../folders/format';

/** One «Ειδικό στοιχείο» ready to show: a text value or a small table (data grid). */
export interface ParticularItem {
  key: string;
  label: string;
  kind: 'text' | 'grid';
  text: string;
  wide: boolean;
  columns: { key: string; label: string }[];
  rows: string[][];
  empty: boolean;
}

const YES_NO = (v: boolean) => (v ? 'Ναι' : 'Όχι');

/** Human text for one value, using the folder type's option labels. */
function show(input: FormioInput, v: FieldValue | undefined): string {
  if (v === null || v === undefined || v === '') return '';
  const label = (val: string) => input.Values?.find((o) => String(o.value) === String(val))?.label ?? String(val);
  switch (input.Type) {
    case 'checkbox':
      return typeof v === 'boolean' ? YES_NO(v) : String(v);
    case 'select':
    case 'radio':
      return Array.isArray(v) ? (v as string[]).map(label).join(', ') : label(String(v));
    case 'selectboxes':
      return v && typeof v === 'object' && !Array.isArray(v)
        ? Object.entries(v)
            .filter(([, on]) => on)
            .map(([k]) => label(k))
            .join(', ')
        : '';
    case 'datetime':
      return typeof v === 'string' ? formatDate(v, true) : String(v);
    case 'password':
      return '••••••';
    default:
      return typeof v === 'object' ? '' : String(v);
  }
}

/** Metadata XML + Formio inputs → display items, in the order the folder type defines. */
export function particularItems(schema: FormioInput[], xml: string | null | undefined): ParticularItem[] {
  if (!schema.length) return [];
  const value = parseMetadata(xml, schema);
  return schema
    .filter((s) => !s.ParentDataGridKey)
    .map((s) => {
      if (s.Type === 'datagrid') {
        const cols = schema.filter((c) => c.ParentDataGridKey === s.Key);
        const rows = (Array.isArray(value[s.Key]) ? (value[s.Key] as Row[]) : [])
          .map((r) => cols.map((c) => show(c, r[c.Key])))
          .filter((cells) => cells.some((c) => c !== ''));
        return {
          key: s.Key, label: s.Label, kind: 'grid' as const, text: '', wide: true,
          columns: cols.map((c) => ({ key: c.Key, label: c.Label })), rows, empty: rows.length === 0,
        };
      }
      const text = show(s, value[s.Key]);
      return {
        key: s.Key, label: s.Label, kind: 'text' as const, text, wide: s.Type === 'textarea' || text.length > 60,
        columns: [], rows: [], empty: text === '',
      };
    });
}

/** «Ειδικά στοιχεία» of a folder, read only: filled fields, with a toggle for the empty ones. */
@Component({
  selector: 'app-particulars-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (shown().length) {
      <dl class="pv">
        @for (it of shown(); track it.key) {
          @if (it.kind === 'grid') {
            <div class="wide">
              <dt>{{ it.label }}</dt>
              <dd>
                @if (it.empty) {
                  <span class="none">—</span>
                } @else {
                  <div class="grid-wrap" tabindex="0" [attr.aria-label]="it.label">
                    <table>
                      <thead>
                        <tr>
                          @for (c of it.columns; track c.key) {
                            <th scope="col">{{ c.label }}</th>
                          }
                        </tr>
                      </thead>
                      <tbody>
                        @for (r of it.rows; track $index) {
                          <tr>
                            @for (cell of r; track $index) {
                              <td>{{ cell || '—' }}</td>
                            }
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                }
              </dd>
            </div>
          } @else {
            <div [class.wide]="it.wide" [class.is-empty]="it.empty">
              <dt>{{ it.label }}</dt>
              <dd class="pre">{{ it.empty ? '—' : it.text }}</dd>
            </div>
          }
        }
      </dl>
    } @else if (!items().length) {
      <p class="none">Το είδος υπόθεσης δεν έχει ειδικά στοιχεία.</p>
    } @else {
      <p class="none">Δεν έχουν συμπληρωθεί ειδικά στοιχεία.</p>
    }
    <div class="pv-foot">
      @if (emptyCount() > 0) {
        <button type="button" class="linklike" (click)="showEmpty.set(!showEmpty())" [attr.aria-pressed]="showEmpty()">
          {{ showEmpty() ? 'Απόκρυψη κενών' : 'Εμφάνιση κενών (' + emptyCount() + ')' }}
        </button>
      }
    </div>
  `,
  styles: `
    :host { display: block; }
    .pv { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: var(--s-3) var(--s-5); margin: 0; }
    .pv .wide { grid-column: 1 / -1; }
    dt { font-size: var(--fs-tiny); color: var(--secondary); }
    dd { margin: 2px 0 0; overflow-wrap: anywhere; }
    .pre { white-space: pre-line; }
    .is-empty dd, .none { color: var(--shade-6); }
    .none { margin: 0; font-size: var(--fs-small); }
    .grid-wrap { overflow-x: auto; border: 1px solid var(--shade-3); border-radius: var(--r-md); margin-top: var(--s-1); }
    .grid-wrap:focus-visible { box-shadow: var(--focus); }
    table { width: 100%; border-collapse: collapse; font-size: var(--fs-small); }
    th { text-align: left; font-weight: 500; color: var(--secondary); background: var(--shade-1alt); white-space: nowrap; }
    th, td { padding: var(--s-2) var(--s-3); border-bottom: 1px solid var(--shade-2); vertical-align: top; }
    tbody tr:last-child td { border-bottom: 0; }
    .pv-foot { display: flex; gap: var(--s-4); margin-top: var(--s-3); }
    .pv-foot:empty { display: none; }
    .linklike { padding: 0; border: 0; background: none; color: var(--accent-dark); cursor: pointer; text-decoration: underline; font-size: var(--fs-small); }
  `,
})
export class ParticularsView {
  readonly items = input.required<ParticularItem[]>();

  protected readonly showEmpty = signal(false);
  protected readonly emptyCount = computed(() => this.items().filter((i) => i.empty).length);
  protected readonly shown = computed(() => (this.showEmpty() ? this.items() : this.items().filter((i) => !i.empty)));
}
