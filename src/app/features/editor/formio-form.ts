import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  ViewEncapsulation,
  effect,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormioInput } from './editor-models';
import { FormValue } from './metadata-xml';

/**
 * «Ειδικά στοιχεία» rendered by @formio/js, the same renderer FolderUI uses through
 * @formio/angular. The Angular wrapper is not used: it needs zone.js and supports Angular
 * up to 21, while this app is zoneless on Angular 22. The library (~400 KB gzip) loads only
 * when this tab opens, together with its stylesheet.
 */

/* Minimal typing of the parts of @formio/js used here. */
interface FormioInstance {
  submission: { data: FormValue };
  setSubmission(s: { data: FormValue }): Promise<unknown>;
  on(event: 'change', cb: (e: { data?: FormValue; changed?: unknown }) => void): void;
  destroy(): void;
  ready: Promise<unknown>;
}
interface FormioModule {
  Formio: {
    createForm(el: HTMLElement, schema: object, options?: object): Promise<FormioInstance>;
    cdn: { setOverrideUrl(lib: string, url: string): void };
  };
}

let formioLoad: Promise<FormioModule> | null = null;

/** Loads the library and its CSS once per page. */
function loadFormio(): Promise<FormioModule> {
  if (!formioLoad) {
    const href = 'formio/formio.form.min.css';
    if (!document.querySelector(`link[href="${href}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      document.head.appendChild(link);
    }
    // Some of Formio's CommonJS dependencies read Node's `global`.
    (globalThis as unknown as Record<string, unknown>)['global'] ??= globalThis;
    formioLoad = (import('@formio/js/form') as unknown as Promise<FormioModule & { default?: FormioModule }>).then((raw) => {
      // CommonJS interop: the dev server exposes named exports, the production build `default`.
      const m = raw.Formio ? raw : (raw.default as FormioModule);
      // The date picker is served with the app instead of cdn.form.io (no third-party calls).
      const base = new URL('formio', document.baseURI).href;
      m.Formio.cdn.setOverrideUrl('flatpickr-formio', base);
      m.Formio.cdn.setOverrideUrl('moment-timezone', base);
      return m;
    });
    formioLoad.catch(() => (formioLoad = null));
  }
  return formioLoad;
}

/** Formio component JSON from the folder type's inputs: same mapping as FolderUI's FormioEditorComponent. */
export function buildFormioSchema(inputs: FormioInput[]): { display: 'form'; components: object[] } {
  const make = (column: FormioInput): Record<string, unknown> => {
    const c: Record<string, unknown> = { type: column.Type, key: column.Key, label: column.Label };
    const d = column.DefaultValue;
    // FolderUI copies DefaultValue as is; the API sends "[[[]],[[]]]" for select boxes, which
    // Formio cannot use, so only scalar defaults are kept.
    if (column.Type !== 'datagrid' && d !== null && d !== undefined && typeof d !== 'object') {
      c['defaultValue'] = column.Type === 'datetime' && typeof d === 'string' ? fromDotNet(d) : d;
    }
    switch (column.Type) {
      case 'textfield':
      case 'textarea':
      case 'number':
      case 'datetime':
      case 'checkbox':
        c['input'] = true;
        break;
      case 'select':
        // Native <select> instead of Choices.js: keyboard and screen readers work out of the box
        // (Choices nests interactive elements, an axe "serious" finding in FolderUI too).
        c['widget'] = 'html5';
        c['dataSrc'] = 'values';
        c['data'] = { values: column.Values ?? [] };
        c['multiple'] = column.HasMultiple === true;
        break;
      case 'selectboxes':
      case 'radio':
        c['values'] = column.Values ?? [];
        break;
      case 'datagrid':
        c['components'] = inputs.filter((x) => x.ParentDataGridKey === column.Key).map(make);
        break;
    }
    return c;
  };
  return { display: 'form', components: inputs.filter((x) => !x.ParentDataGridKey).map(make) };
}

/** `/Date(1791018000000+0300)/` → ISO, which Formio's datetime understands. */
function fromDotNet(v: string): string {
  const m = /\/Date\((-?\d+)/.exec(v);
  return m ? new Date(Number(m[1])).toISOString() : v;
}

/** Dates stored by the classic UI come as /Date()/; Formio needs ISO strings. */
function forFormio(value: FormValue, inputs: FormioInput[]): FormValue {
  const dates = new Set(inputs.filter((i) => i.Type === 'datetime').map((i) => i.Key));
  const fix = (row: Record<string, unknown>): Record<string, unknown> =>
    Object.fromEntries(
      Object.entries(row).map(([k, v]) => [
        k,
        typeof v === 'string' && dates.has(k) ? fromDotNet(v) : Array.isArray(v) && v.every((r) => r && typeof r === 'object') ? v.map((r) => fix(r as Record<string, unknown>)) : v,
      ]),
    );
  return fix(value) as FormValue;
}

@Component({
  selector: 'app-formio-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  template: `
    @if (state() === 'loading') {
      <div class="fx-loading" role="status" aria-label="Φόρτωση φόρμας">
        <span class="skel" style="width: 60%"></span>
        <span class="skel" style="width: 80%"></span>
        <span class="skel" style="width: 45%"></span>
      </div>
    } @else if (state() === 'error') {
      <p class="fx-error" role="alert">Η φόρμα δεν φορτώθηκε. Ελέγξτε τη σύνδεση και ανοίξτε ξανά την καρτέλα. <small>{{ errorText() }}</small></p>
    }
    <div #host class="fx" [class.fx--readonly]="readonly()" [class.fx--hidden]="state() !== 'ready'" [attr.data-ready]="state() === 'ready' || null"></div>
  `,
  styles: `
    app-formio-form { display: block; }
    app-formio-form .fx--hidden { visibility: hidden; height: 0; overflow: hidden; }
    .fx-loading { display: grid; gap: var(--s-3); }
    .fx-error { color: var(--notice-dark); }
    /* Formio writes Bootstrap markup; these rules give it the app's look without Bootstrap. */
    app-formio-form .fx .formio-form { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(260px, 100%), 1fr)); gap: var(--s-4); align-items: start; }
    app-formio-form .fx .formio-component-textarea,
    app-formio-form .fx .formio-component-datagrid,
    app-formio-form .fx .formio-component-selectboxes,
    app-formio-form .fx .formio-component-radio { grid-column: 1 / -1; }
    app-formio-form .fx .form-group { margin: 0; display: grid; gap: var(--s-1); }
    app-formio-form .fx .col-form-label, app-formio-form .fx label.form-label, app-formio-form .fx legend { font-size: var(--fs-small); color: var(--secondary); padding: 0; }
    app-formio-form .fx .form-control {
      width: 100%; min-height: 36px; padding: 0 var(--s-3); border: 1px solid var(--shade-4); border-radius: var(--r-md);
      background: var(--white); font: inherit; color: inherit;
    }
    app-formio-form .fx textarea.form-control { padding: var(--s-2) var(--s-3); min-height: 76px; }
    app-formio-form .fx .form-control:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
    app-formio-form .fx .form-control[disabled], app-formio-form .fx .form-control[readonly] { background: var(--shade-1alt); }
    app-formio-form .fx .form-check { display: flex; align-items: center; gap: var(--s-2); font-size: var(--fs-small); }
    app-formio-form .fx .form-check-input { width: 18px; height: 18px; margin: 0; accent-color: var(--accent); }
    app-formio-form .fx .form-radio, app-formio-form .fx .form-check + .form-check { margin-top: var(--s-1); }
    app-formio-form .fx .input-group { display: flex; }
    app-formio-form .fx .input-group-text { display: inline-flex; align-items: center; padding: 0 var(--s-2); border: 1px solid var(--shade-4); border-left: 0; border-radius: 0 var(--r-md) var(--r-md) 0; background: var(--shade-1); }
    app-formio-form .fx .input-group > .form-control:not(:last-child) { border-radius: var(--r-md) 0 0 var(--r-md); }
    app-formio-form .fx table.datagrid-table { width: 100%; border-collapse: collapse; font-size: var(--fs-small); }
    app-formio-form .fx table.datagrid-table th { text-align: left; font-weight: 500; color: var(--secondary); padding: var(--s-2); border-bottom: 1px solid var(--shade-3); }
    app-formio-form .fx table.datagrid-table td { padding: var(--s-2); border-bottom: 1px solid var(--shade-2); vertical-align: top; }
    app-formio-form .fx .btn {
      display: inline-flex; align-items: center; gap: var(--s-1); min-height: 32px; padding: 0 var(--s-3);
      border: 1px solid var(--shade-4); border-radius: var(--r-md); background: var(--white); font-size: var(--fs-small); cursor: pointer;
    }
    app-formio-form .fx .btn-primary { background: var(--accent-dark); border-color: var(--accent-dark); color: var(--white); }
    app-formio-form .fx .btn-secondary { color: var(--notice-dark); }
    app-formio-form .fx .formio-errors .error, app-formio-form .fx .invalid-feedback { color: var(--notice-dark); font-size: var(--fs-tiny); }
    app-formio-form .fx .formio-component-button[ref='button'], app-formio-form .fx button[name='data[submit]'] { display: none; }
    app-formio-form .fx .choices__inner { min-height: 36px; border-radius: var(--r-md); background: var(--white); border-color: var(--shade-4); }
    app-formio-form .fx .bi, app-formio-form .fx .fa { font-style: normal; }
    app-formio-form .fx .visually-hidden {
      position: absolute !important; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
    }
  `,
})
export class FormioForm implements OnDestroy {
  /** Folder-type inputs (FolderUI shape), turned into a Formio form here. */
  readonly schema = input<FormioInput[]>([]);
  /** Or a Formio form as is (Docutracks kinds and metadata classes store Formio JSON). */
  readonly components = input<object[] | null>(null);
  readonly value = input.required<FormValue>();
  readonly readonly = input(false);
  readonly valueChange = output<FormValue>();

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly errorText = signal('');
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private form: FormioInstance | null = null;

  constructor() {
    // (Re)build when the schema or read-only flag changes.
    effect(() => {
      const inputs = this.schema();
      this.components();
      const readOnly = this.readonly();
      const el = this.host().nativeElement;
      untracked(() => void this.render(el, inputs, readOnly));
    });

    // The initial value is read once per render: the form owns the data while it is open,
    // and our own echo (value → Metadata → value) must not reset the cursor.
  }

  private async render(el: HTMLElement, inputs: FormioInput[], readOnly: boolean): Promise<void> {
    this.state.set('loading');
    try {
      const { Formio } = await loadFormio();
      this.form?.destroy();
      el.replaceChildren();
      // Formio fires "change" while it applies defaults and the initial data. Only changes that
      // follow a user action inside the form (typing, clicking, picking) are reported.
      let touched = false;
      const touch = (): void => void (touched = true);
      for (const ev of ['input', 'change', 'click', 'keydown']) el.addEventListener(ev, touch, true);
      const raw = untracked(this.components);
      const form = await Formio.createForm(el, raw ? { display: 'form', components: raw } : buildFormioSchema(inputs), {
        readOnly,
        noAlerts: true,
        language: 'el',
        // The few strings Formio shows in these forms.
        i18n: { el: { 'Add Another': 'Προσθήκη γραμμής', required: 'Το πεδίο {{field}} είναι υποχρεωτικό.', invalid_email: 'Το {{field}} δεν είναι έγκυρο email.' } },
      });
      this.form = form;
      let baseline = '';
      form.on('change', (e) => {
        if (!e.data) return;
        const data = { ...e.data } as Record<string, unknown>;
        delete data['submit'];
        const json = JSON.stringify(data);
        if (!touched || json === baseline) {
          baseline = json;
          return;
        }
        baseline = json;
        this.valueChange.emit(data as FormValue);
      });
      await form.setSubmission({ data: forFormio(untracked(this.value), inputs) });
      this.state.set('ready');
    } catch (e) {
      this.errorText.set(e instanceof Error ? e.message : String(e));
      this.state.set('error');
    }
  }

  ngOnDestroy(): void {
    this.form?.destroy();
    this.form = null;
  }
}
