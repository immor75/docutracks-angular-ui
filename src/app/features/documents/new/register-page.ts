import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, linkedSignal, signal, untracked, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { RegisterField } from '../../../core/documents-models';
import { errorMessage } from '../../../core/http';
import { CLASSIC, DOCUMENTS } from '../../../core/paths';
import { Session } from '../../../core/session';
import { Icon } from '../../../ui/icon';
import { Sheet } from '../../../ui/sheet';
import { Toasts } from '../../../ui/toasts';
import { RegField } from './reg-field';
import { RegisterStore } from './register-store';

/** Types registered here (phase 8α); the others still open the classic form. */
export const IN_APP_TYPES = new Set([1]);

/**
 * «Νέο έγγραφο» at `/documents/new?t=<NewType>&old=1&back=<list url>`. Without `t`, the type is
 * chosen first (UINewSelection). The form is the server's description of DocumentPropertiesEditor
 * for the type, as «Σύντομη» (one page) or «Αναλυτική» (tabs) registration.
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

  protected readonly errorMessage = errorMessage;
  protected readonly classicNew = computed(() => CLASSIC.newDocument(this.session.groupId()));
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

  /* ---------- the form ---------- */

  protected readonly tab = linkedSignal(() => this.store.tabs()[0]?.Key ?? 'basic');
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
      untracked(() => {
        this.store.type.set(Number.isFinite(t) && t > 0 ? t : null);
        this.store.old.set(this.old() === '1');
      });
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
    this.toasts.success(`Το έγγραφο καταχωρίστηκε${r.ProtocolText ? ' με Αριθμ. Πρωτ. ' + r.ProtocolText : ''}.`);
    this.leave(r.DocumentId, true);
  }

  protected cancel(): void {
    this.leave(null, false);
  }

  /** Back to the list it came from, with the new document open. */
  private leave(id: number | null, force: boolean): void {
    const back = this.back() && this.back()!.startsWith(DOCUMENTS) ? this.back()! : DOCUMENTS;
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
