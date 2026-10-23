import { FormioInput } from './editor-models';

/**
 * «Ειδικά στοιχεία» are stored in `Folder.Metadata` as XML, e.g.
 *   <ExtendedMetadata><metadataTitle type='string'>test</metadataTitle>
 *     <selectboxes><a type='boolean'>true</a></selectboxes>
 *     <datagrid><textfield type='string'>x</textfield></datagrid>
 *     <datagrid><textfield type='string'>y</textfield></datagrid>
 *   </ExtendedMetadata>
 * Same format as FolderUI (folder-particulars). Differences: the field type comes from the
 * folder type's Formio inputs instead of the key name, so a select-boxes field inside a data
 * grid or named other than "selectboxes" is written correctly (FolderUI writes "[object Object]").
 */

export type FieldValue = string | number | boolean | null | Record<string, boolean> | Row[] | string[];
export type Row = Record<string, FieldValue>;
export type FormValue = Record<string, FieldValue>;

const isGridKey = (k: string) => k === 'datagrid' || /^datagrid\d+$/.test(k);

function typeOf(schema: FormioInput[], key: string, parent = ''): string | undefined {
  return schema.find((s) => s.Key === key && (s.ParentDataGridKey ?? '') === parent)?.Type;
}

function convert(text: string, type: string | null): FieldValue {
  if (text === '') return '';
  if (type === 'boolean') return text.toLowerCase() === 'true';
  if (type === 'number') {
    const n = Number(text);
    return Number.isNaN(n) ? text : n;
  }
  return text;
}

function readElement(el: Element, schema: FormioInput[], parent: string): Row {
  const out: Row = {};
  for (const child of Array.from(el.children)) {
    const key = child.tagName;
    const type = typeOf(schema, key, parent);
    if (type === 'datagrid' || (!type && isGridKey(key))) {
      const rows = (out[key] as Row[] | undefined) ?? [];
      rows.push(readElement(child, schema, key));
      out[key] = rows;
    } else if (type === 'selectboxes' || child.children.length > 0) {
      const box: Record<string, boolean> = {};
      for (const opt of Array.from(child.children)) box[opt.tagName] = (opt.textContent ?? '').toLowerCase() === 'true';
      out[key] = box;
    } else if (type === 'select' && schema.find((x) => x.Key === key)?.HasMultiple) {
      // Multiple select: FolderUI writes String(array), i.e. "a,b".
      out[key] = (child.textContent ?? '').split(',').filter(Boolean);
    } else {
      out[key] = convert(child.textContent ?? '', child.getAttribute('type'));
    }
  }
  return out;
}

export function parseMetadata(xml: string | null | undefined, schema: FormioInput[]): FormValue {
  if (!xml || !xml.trim()) return {};
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  if (doc.querySelector('parsererror')) return {};
  const root = doc.querySelector('ExtendedMetadata');
  return root ? readElement(root, schema, '') : {};
}

/** Valid XML element name: Formio keys are identifiers, but be defensive. */
const safeName = (k: string) => (/^[A-Za-z_][\w.-]*$/.test(k) ? k : null);

function writeValue(doc: XMLDocument, parentEl: Element, key: string, value: FieldValue, type: string | undefined): void {
  const name = safeName(key);
  if (!name) return;
  if (Array.isArray(value) && (type === 'datagrid' || (!type && isGridKey(key)))) {
    for (const row of value as Row[]) {
      const rowEl = doc.createElement(name);
      for (const [k, v] of Object.entries(row ?? {})) writeValue(doc, rowEl, k, v, undefined);
      parentEl.appendChild(rowEl);
    }
    return;
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const box = doc.createElement(name);
    for (const [opt, on] of Object.entries(value)) {
      const optName = safeName(opt);
      if (!optName) continue;
      const optEl = doc.createElement(optName);
      optEl.setAttribute('type', 'boolean');
      optEl.textContent = String(!!on);
      box.appendChild(optEl);
    }
    parentEl.appendChild(box);
    return;
  }
  const el = doc.createElement(name);
  if (Array.isArray(value)) {
    el.setAttribute('type', 'string');
    el.textContent = value.join(',');
  } else {
    el.setAttribute('type', typeof value === 'boolean' ? 'boolean' : typeof value === 'number' ? 'number' : 'string');
    if (value !== null && value !== undefined && value !== '') el.textContent = String(value);
  }
  parentEl.appendChild(el);
}

export function buildMetadata(value: FormValue, schema: FormioInput[]): string {
  const doc = document.implementation.createDocument('', '', null);
  const root = doc.createElement('ExtendedMetadata');
  doc.appendChild(root);
  for (const [key, v] of Object.entries(value)) writeValue(doc, root, key, v, typeOf(schema, key));
  return new XMLSerializer().serializeToString(doc);
}

/** /Date(ms+0300)/ and ISO → value for <input type="date|datetime-local">. */
export function toInputDate(v: unknown, withTime: boolean): string {
  if (typeof v !== 'string' || !v) return '';
  const dotnet = /\/Date\((-?\d+)/.exec(v);
  const d = dotnet ? new Date(Number(dotnet[1])) : new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return withTime ? `${day}T${pad(d.getHours())}:${pad(d.getMinutes())}` : day;
}

/** Initial value for a Formio input, cleaning FolderUI's odd array defaults ("[[[]],[[]]]"). */
export function defaultFor(input: FormioInput): FieldValue {
  const d = input.DefaultValue;
  switch (input.Type) {
    case 'checkbox':
      return typeof d === 'boolean' ? d : false;
    case 'selectboxes':
      return Object.fromEntries((input.Values ?? []).map((v) => [v.value, false]));
    case 'datagrid':
      return [];
    case 'number':
      return typeof d === 'number' ? d : null;
    case 'datetime':
      return typeof d === 'string' && d ? new Date(Number(/\/Date\((-?\d+)/.exec(d)?.[1] ?? Date.parse(d))).toISOString() : '';
    default:
      return typeof d === 'string' || typeof d === 'number' ? String(d) : '';
  }
}
