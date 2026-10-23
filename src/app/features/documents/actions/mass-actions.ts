import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { DocumentsApi } from '../../../core/documents-api';
import { errorMessage } from '../../../core/http';
import { Session } from '../../../core/session';
import { Icon } from '../../../ui/icon';
import { DocumentListStore } from '../document-list.store';
import { DocActionRunner, DocTarget, Failure, IN_APP } from './doc-action-runner';

export interface MassAction {
  code: string;
  name: string;
  /** Documents of the selection the action can run on. */
  targets: DocTarget[];
  /** Selected documents that do not allow it: then the action is off for all (as in Razor). */
  excluded: Failure[];
  /** Runs here; otherwise only from the classic catalog for now. */
  inApp: boolean;
}

/**
 * Builds the menu from `POST actions` for the selected documents: every action marked `Mass`
 * for at least one of them. As in the Razor catalog (UIMassiveActionsForEntities), an action
 * runs only when every selected document allows it; otherwise it is listed as unavailable,
 * naming the documents that block it.
 */
export function massActions(
  docs: { DocumentId: number; Actions: { Code: string; Name: string; Enabled: boolean; Reason?: string | null; Mass?: boolean }[] }[],
  titles: ReadonlyMap<number, string>,
  inApp: (code: string) => boolean,
): MassAction[] {
  const byCode = new Map<string, MassAction>();
  for (const d of docs) {
    const target = { id: d.DocumentId, title: titles.get(d.DocumentId) ?? '' };
    for (const a of d.Actions) {
      if (!a.Mass) continue;
      let m = byCode.get(a.Code);
      if (!m) byCode.set(a.Code, (m = { code: a.Code, name: a.Name, targets: [], excluded: [], inApp: inApp(a.Code) }));
      if (a.Enabled) m.targets.push(target);
      else m.excluded.push({ target, message: a.Reason || 'Η ενέργεια δεν επιτρέπεται.' });
    }
  }
  // Documents that do not offer the action at all are excluded too.
  for (const m of byCode.values()) {
    const seen = new Set([...m.targets, ...m.excluded.map((x) => x.target)].map((t) => t.id));
    for (const d of docs) {
      if (!seen.has(d.DocumentId)) {
        m.excluded.push({ target: { id: d.DocumentId, title: titles.get(d.DocumentId) ?? '' }, message: 'Η ενέργεια δεν είναι διαθέσιμη για αυτό το έγγραφο.' });
      }
    }
  }
  return [...byCode.values()];
}

/** «Ενέργειες» of the selection bar: a native popover menu, loaded when it opens. */
@Component({
  selector: 'app-mass-actions',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button #trigger type="button" class="btn btn--ghost" popovertarget="mass-menu" aria-haspopup="menu" title="Ενέργειες για τα επιλεγμένα">
      <app-icon name="more" [size]="18" /><span class="hide-sm">Ενέργειες</span>
    </button>
    <div #menu id="mass-menu" popover class="menu" [attr.role]="actions().length && !loading() ? 'menu' : null" tabindex="-1" aria-label="Ενέργειες για τα επιλεγμένα"
      (toggle)="onToggle($event)" (keydown)="menuKey($event)">
      @if (loading() || !loaded()) {
        <p class="menu__note" role="status">Έλεγχος των {{ list.selectedCount() }} εγγράφων…</p>
      } @else if (error(); as e) {
        <p class="menu__note" role="alert">Οι ενέργειες δεν φορτώθηκαν. {{ e }}</p>
      } @else {
        @for (m of available(); track m.code) {
          <button type="button" role="menuitem" class="item" (click)="pick(m)">
            <span>{{ m.name }}</span>
          </button>
        }
        @if (!available().length) {
          <p class="menu__note">Καμία μαζική ενέργεια δεν επιτρέπεται για αυτά τα έγγραφα.</p>
        }
        @if (unavailable().length) {
          <p class="menu__title">Μη διαθέσιμες</p>
          @for (m of unavailable(); track m.code) {
            <div role="menuitem" class="item item--off" aria-disabled="true" tabindex="-1">
              <span>{{ m.name }}</span>
              <small>{{ m.inApp || !m.excluded.length ? blocked(m) : 'Μαζικά γίνεται ακόμη από τον κλασικό κατάλογο.' }}</small>
            </div>
            @if (m.inApp && m.excluded.length && m.targets.length) {
              <button type="button" role="menuitem" class="item item--fix" (click)="deselect(m)">
                Αποεπιλογή {{ m.excluded.length === 1 ? 'του εγγράφου' : 'των ' + m.excluded.length + ' εγγράφων' }} για «{{ m.name }}»
              </button>
            }
          }
        }
      }
    </div>
  `,
  styles: `
    :host { display: contents; }
    .menu {
      position: fixed; inset: auto; margin: 0; width: min(340px, calc(100vw - 32px)); max-height: min(70dvh, 520px); overflow: auto;
      padding: var(--s-2); border: 1px solid var(--shade-3); border-radius: var(--r-lg); background: var(--white); box-shadow: var(--shadow-2);
      color: var(--body);
    }
    .menu__title { margin: var(--s-2) var(--s-2) var(--s-1); font-size: var(--fs-tiny); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--secondary); }
    .menu__note { margin: var(--s-2); font-size: var(--fs-small); color: var(--secondary); }
    .item {
      display: flex; align-items: baseline; justify-content: space-between; gap: var(--s-2); width: 100%; padding: var(--s-2);
      border: 0; border-radius: var(--r-md); background: none; color: var(--body); text-align: left; font: inherit; font-size: var(--fs-small); cursor: pointer;
    }
    button.item:hover, .item:focus-visible { background: var(--hover); }
    .item small { color: var(--secondary); font-size: var(--fs-tiny); }
    .item--off { flex-direction: column; color: var(--shade-6); cursor: default; }
    .item--fix { margin: -4px 0 var(--s-1); padding-top: 2px; color: var(--accent-dark); font-size: var(--fs-tiny); }
  `,
})
export class MassActions {
  protected readonly list = inject(DocumentListStore);
  private readonly api = inject(DocumentsApi);
  private readonly session = inject(Session);
  private readonly runner = inject(DocActionRunner);
  private readonly menu = viewChild.required<ElementRef<HTMLElement>>('menu');
  private readonly trigger = viewChild.required<ElementRef<HTMLElement>>('trigger');

  protected readonly loading = signal(false);
  /** The menu has the actions of the current selection (not those of an earlier opening). */
  protected readonly loaded = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly actions = signal<MassAction[]>([]);
  protected readonly available = computed(() => this.actions().filter((m) => m.targets.length && !m.excluded.length && m.inApp));
  protected readonly unavailable = computed(() => this.actions().filter((m) => !this.available().includes(m)));

  /** Loads the actions of the current selection each time the menu opens, then places it. */
  protected async onToggle(event: Event): Promise<void> {
    if ((event as ToggleEvent).newState !== 'open') {
      this.actions.set([]); // the next opening reflects the selection of that moment
      this.loaded.set(false);
      return;
    }
    this.place();
    const groupId = this.session.groupId();
    const targets = this.list.selectedTargets();
    if (!groupId || !targets.length) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      const docs = await firstValueFrom(this.api.actionsOfMany(groupId, targets.map((t) => t.id)));
      const titles = new Map(targets.map((t) => [t.id, t.title]));
      this.actions.set(massActions(docs, titles, (c) => IN_APP.has(c)));
    } catch (e) {
      this.error.set(errorMessage(e));
    }
    this.loading.set(false);
    this.loaded.set(true);
    queueMicrotask(() => {
      this.place();
      this.menu().nativeElement.querySelector<HTMLElement>('button[role=menuitem]')?.focus();
    });
  }

  private place(): void {
    const menu = this.menu().nativeElement;
    const r = this.trigger().nativeElement.getBoundingClientRect();
    const w = menu.offsetWidth;
    menu.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - w - 8))}px`;
    menu.style.top = `${r.bottom + 4}px`;
  }

  protected pick(m: MassAction): void {
    this.menu().nativeElement.hidePopover();
    this.runner.open(m.code, m.name, m.targets);
  }

  /** «Δεν μπορεί να εκτελεστεί η ενέργεια για τα έγγραφα …» (ActionNotAllowedForDocumentsGeneric). */
  protected blocked(m: MassAction): string {
    const names = m.excluded.map((x) => `«${x.target.title || 'Α/Α ' + x.target.id}»`);
    const shown = names.slice(0, 3).join(', ') + (names.length > 3 ? ` και ${names.length - 3} ακόμη` : '');
    const reasons = [...new Set(m.excluded.map((x) => x.message))];
    return `Δεν μπορεί να εκτελεστεί η ενέργεια για τα έγγραφα ${shown}.` + (reasons.length === 1 ? ` ${reasons[0]}` : '');
  }

  /** Leaves out the documents that block an action, so it can run on the rest. */
  protected deselect(m: MassAction): void {
    this.list.deselect(m.excluded.map((x) => x.target.id));
    this.menu().nativeElement.hidePopover();
  }

  /** Arrows, Home and End move between items (WAI-ARIA menu). */
  protected menuKey(event: KeyboardEvent): void {
    const items = [...this.menu().nativeElement.querySelectorAll<HTMLElement>('button[role=menuitem]')];
    const i = items.indexOf(document.activeElement as HTMLElement);
    let next = -1;
    if (event.key === 'ArrowDown') next = (i + 1) % items.length;
    else if (event.key === 'ArrowUp') next = (i - 1 + items.length) % items.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    if (next < 0 || !items.length) return;
    event.preventDefault();
    items[next]?.focus();
  }
}
