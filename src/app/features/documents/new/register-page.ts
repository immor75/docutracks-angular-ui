import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, linkedSignal, signal, untracked, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { NewFromMode, RegisterField } from '../../../core/documents-models';
import { errorMessage } from '../../../core/http';
import { CLASSIC, DOCUMENTS } from '../../../core/paths';
import { Session } from '../../../core/session';
import { Icon } from '../../../ui/icon';
import { Sheet } from '../../../ui/sheet';
import { Toasts } from '../../../ui/toasts';
import { RegField } from './reg-field';
import { RegisterStore } from './register-store';

/** Types registered here: all four of test-new (8α Εισερχόμενο, 8β Σχέδιο, 8γ Εξερχόμενο, Υποστηρικτικά). */
export const IN_APP_TYPES = new Set([1, 6, 7, 5]);

const MODES: Record<NewFromMode, string> = { answer: 'Απάντηση', clone: 'Κλωνοποίηση' };

/**
 * «Νέο έγγραφο» at `/documents/new?t=<NewType>&old=1&back=<list url>`. Without `t`, the type is
 * chosen first (UINewSelection). The form is the server's description of DocumentPropertiesEditor
 * for the type, as «Σύντομη» (one page) or «Αναλυτική» (tabs) registration.
 *
 * The same page answers or clones a document (`&from=<id>&mode=answer|clone`: the server
 * prefills the form) and edits one (`/documents/<id>/edit`: its current values, some read-only).
 */
@Component({
  selector: 'app-register-page',
  imports: [Icon, Sheet, RegField],
  providers: [RegisterStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './register-page.html',
  styleUrl: './register-page.css',
  host: { '(window:beforeunload)': 'onUnload($event)', '(document:keydown)': 'onKey($event)' },
})
export class RegisterPage {
  protected readonly store = inject(RegisterStore);
  private readonly router = inject(Router);
  private readonly session = inject(Session);
  private readonly toasts = inject(Toasts);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  /** Query parameters, bound by `withComponentInputBinding()`. */
  readonly t = input<string | undefined>();
  readonly old = input<string | undefined>();
  readonly back = input<string | undefined>();
  readonly from = input<string | undefined>();
  readonly mode = input<string | undefined>();
  /** Route parameter of `/documents/:id/edit`. */
  readonly id = input<string | undefined>();

  protected readonly errorMessage = errorMessage;
  protected readonly classicNew = computed(() => {
    const g = this.session.groupId();
    const edit = this.store.editId();
    const from = this.store.from();
    if (edit) return CLASSIC.documentAction(g, 'UiEdit', edit);
    if (from) return CLASSIC.documentAction(g, from.mode === 'answer' ? 'UiAnswer' : 'UiClone', from.from);
    return CLASSIC.newDocument(g);
  });
  protected readonly isEdit = this.store.isEdit;
  /** «Απάντηση» or «Κλωνοποίηση», when the document comes from another. */
  protected readonly modeLabel = computed(() => {
    const m = this.store.from()?.mode;
    return m ? MODES[m] : null;
  });
  protected readonly source = computed(() => this.store.f()?.Source ?? (this.store.types.hasValue() ? this.store.types.value().Source : null) ?? null);
  protected readonly kicker = computed(() => {
    if (this.isEdit()) return 'Επεξεργασία';
    const m = this.modeLabel();
    if (m) return m + (this.source() ? ` · «${this.source()!.Title}»` : '');
    return 'Καταχώριση' + (this.store.old() ? ' παλαιότερου' : '');
  });
  protected readonly saveLabel = computed(() => (this.isEdit() ? 'Αποθήκευση' : 'Καταχώριση'));
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');

  /* ---------- type selection ---------- */

  protected readonly chosen = linkedSignal<number | null>(() => {
    const types = this.store.types.hasValue() ? this.store.types.value().Types : [];
    return types.find((x) => IN_APP_TYPES.has(x.Id))?.Id ?? types[0]?.Id ?? null;
  });
  protected readonly oldChecked = signal(false);
  protected readonly inApp = (id: number) => IN_APP_TYPES.has(id);

  protected start(): void {
    const t = this.chosen();
    if (t === null) return;
    if (!IN_APP_TYPES.has(t)) {
      window.location.href = this.classicNew();
      return;
    }
    void this.router.navigate([], { queryParams: { t, old: this.oldChecked() ? 1 : null }, queryParamsHandling: 'merge' });
  }

  /** Types this UI can open, of those the server allows (an answer or a clone may allow one). */
  private readonly onlyType = computed(() => {
    const types = this.store.types.hasValue() ? this.store.types.value().Types : [];
    return types.length === 1 && IN_APP_TYPES.has(types[0].Id) ? types[0].Id : null;
  });

  /* ---------- the form ---------- */

  /** The open tab; stays put while values change, moves only if its tab disappears. */
  protected readonly tab = linkedSignal<string, string>({
    source: () => this.store.tabs().map((t) => t.Key).join(','),
    computation: (keys, prev) => {
      const list = keys.split(',');
      return prev && list.includes(prev.value) ? prev.value : (list[0] || 'basic');
    },
  });
  protected readonly visible = computed(() =>
    this.store.brief() ? this.store.fields() : this.store.fields().filter((f) => f.Tab === this.tab()),
  );
  /** Brief registration: one page, headed by the tab each field comes from. */
  protected readonly briefGroups = computed(() =>
    this.store.tabs().map((t) => ({ ...t, fields: this.store.fields().filter((f) => f.Tab === t.Key) })).filter((g) => g.fields.length),
  );
  protected readonly tabIssues = computed(() => new Set(this.store.issues().map((i) => i.tab)));
  protected readonly leaving = signal<((ok: boolean) => void) | null>(null);

  constructor() {
    effect(() => {
      const t = Number(this.t());
      const id = Number(this.id());
      const from = Number(this.from());
      const mode = this.mode() === 'answer' || this.mode() === 'clone' ? (this.mode() as NewFromMode) : null;
      const old = this.old() === '1';
      untracked(() => {
        this.store.editId.set(Number.isFinite(id) && id > 0 ? id : null);
        this.store.setFrom(Number.isFinite(from) && from > 0 ? from : null, mode);
        this.store.type.set(Number.isFinite(t) && t > 0 ? t : null);
        this.store.old.set(old);
      });
    });
    // An answer or a clone that can become one type only: no choice to make (Razor: hidden radio).
    effect(() => {
      const only = this.onlyType();
      if (only !== null && this.store.from() && !this.store.type()) {
        untracked(() => void this.router.navigate([], { queryParams: { t: only }, queryParamsHandling: 'merge', replaceUrl: true }));
      }
    });
    // Focus the title when the form appears, so screen readers start there.
    effect(() => {
      if (this.store.f()) queueMicrotask(() => this.heading()?.nativeElement.focus({ preventScroll: true }));
    });
  }

  /** Short fields share a row; text areas, pickers, files and check boxes take the whole width. */
  protected isWide(f: RegisterField): boolean {
    if (f.Kind === 'text') return !!f.Multiline;
    if (f.Kind === 'select') return !!f.Multi;
    return !['date', 'number', 'display'].includes(f.Kind);
  }

  protected selectTab(key: string): void {
    this.tab.set(key);
  }

  protected tabKey(event: KeyboardEvent, index: number): void {
    const tabs = this.store.tabs();
    let next = -1;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    if (next < 0) return;
    event.preventDefault();
    this.tab.set(tabs[next].Key);
    queueMicrotask(() => this.host.querySelector<HTMLElement>(`#rt-${tabs[next].Key}`)?.focus());
  }

  /** Opens the tab of a field and puts the cursor in it. */
  protected goTo(tab: string, key: string): void {
    if (!this.store.brief()) this.tab.set(tab);
    setTimeout(() => {
      const el = this.host.querySelector<HTMLElement>(`[data-field="${key}"]`);
      el?.scrollIntoView({ block: 'center' });
      el?.querySelector<HTMLElement>('input:not([type=hidden]):not(.sr-only), textarea, select, button')?.focus();
    });
  }

  protected setBrief(on: boolean): void {
    this.store.brief.set(on);
  }

  protected async register(): Promise<void> {
    const r = await this.store.register();
    if (!r) {
      const first = this.store.issues()[0];
      if (first) this.goTo(first.tab, first.key);
      return;
    }
    this.toasts.success(
      this.isEdit() ? 'Οι αλλαγές αποθηκεύτηκαν.' : `Το έγγραφο καταχωρίστηκε${r.ProtocolText ? ' με Αριθμ. Πρωτ. ' + r.ProtocolText : ''}.`,
    );
    this.leave(r.DocumentId, true);
  }

  protected cancel(): void {
    this.leave(null, false);
  }

  /** Back to the list it came from, with the new (or edited) document open. */
  private leave(id: number | null, force: boolean): void {
    const fallback = this.store.editId() ? `${DOCUMENTS}/${this.store.editId()}` : DOCUMENTS;
    const back = this.back() && this.back()!.startsWith(DOCUMENTS) ? this.back()! : fallback;
    const query = back.includes('?') ? back.slice(back.indexOf('?')) : '';
    this.force = force;
    void this.router.navigateByUrl(id ? `${DOCUMENTS}/${id}${query}` : back);
  }

  private force = false;

  /** canDeactivate: ask before dropping what was typed. */
  confirmLeave(): boolean | Promise<boolean> {
    if (this.force || !this.store.dirty()) return true;
    return new Promise((resolve) => this.leaving.set(resolve));
  }

  protected answerLeave(ok: boolean): void {
    this.leaving()?.(ok);
    this.leaving.set(null);
  }

  protected onUnload(event: BeforeUnloadEvent): void {
    if (this.store.dirty()) event.preventDefault();
  }

  /** Ctrl/Cmd+S registers. */
  protected onKey(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && this.store.f()) {
      event.preventDefault();
      void this.register();
    }
  }
}
