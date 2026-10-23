import { ChangeDetectionStrategy, Component, ElementRef, computed, input, output, viewChild } from '@angular/core';
import { UiAction } from '../../core/models';
import { Icon, IconName } from '../../ui/icon';
import { specFor } from './action-catalog';

const P = 'FoldersModule_Ui';

/** Shown as buttons, in this order, when they can run. The rest go in the menu. */
const PRIMARY = [P + 'Edit', P + 'Assign', P + 'Send', P + 'TakeOwnership', P + 'Return', P + 'Archive', P + 'UnArchive'];

const ICON: Record<string, IconName> = {
  [P + 'Assign']: 'user-add',
  [P + 'Send']: 'send',
  [P + 'Return']: 'return',
  [P + 'TakeOwnership']: 'user-check',
  [P + 'Archive']: 'archive',
  [P + 'UnArchive']: 'undo',
  [P + 'Clone']: 'copy',
  [P + 'Delete']: 'trash',
  [P + 'Share']: 'share',
  [P + 'ChangeType']: 'exchange',
  [P + 'MassivePrint']: 'print',
  [P + 'ViewHist']: 'clock',
  [P + 'Edit']: 'edit',
  [P + 'New']: 'plus',
};

let seq = 0;

/**
 * The actions of one folder (or of a selection): the common ones as buttons, the rest in
 * a native popover menu. Actions this UI cannot run yet are marked and open the classic UI.
 */
@Component({
  selector: 'app-action-menu',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (a of inline(); track a.UiActionCode) {
      <button type="button" class="btn" (click)="run.emit(a)">
        <app-icon [name]="icon(a)" [size]="18" />
        <span [class.hide-sm]="compact()">{{ a.UiActionName }}</span>
      </button>
    }
    @if (rest().length) {
      <button
        #trigger
        type="button"
        class="btn"
        [class.btn--icon]="compact()"
        [attr.popovertarget]="menuId"
        aria-haspopup="menu"
        [attr.aria-label]="compact() ? 'Περισσότερες ενέργειες' : null"
        title="Περισσότερες ενέργειες"
      >
        <app-icon name="more" [size]="18" />
        @if (!compact()) {
          <span>Περισσότερα</span>
        }
      </button>
      <div #menu [id]="menuId" tabindex="-1" popover class="menu" role="menu" aria-label="Ενέργειες" (toggle)="onToggle($event)" (keydown)="menuKey($event)">
        @for (a of rest(); track a.UiActionCode) {
          <button
            type="button"
            role="menuitem"
            [attr.aria-disabled]="!a.CanExecute || null"
            [attr.title]="a.CanExecute ? null : a.ValidationMessage || 'Δεν είναι διαθέσιμη τώρα'"
            (click)="pick(a)"
          >
            <app-icon [name]="icon(a)" [size]="18" />
            <span>{{ a.UiActionName }}</span>
            @if (isClassic(a)) {
              <app-icon name="external" [size]="14" class="ext" />
              <span class="sr-only">(ανοίγει το κλασικό UI)</span>
            }
          </button>
        }
      </div>
    }
  `,
  styles: `
    :host { display: flex; flex-wrap: wrap; gap: var(--s-2); }
    .menu {
      margin: 0; padding: var(--s-1); min-width: 240px; max-height: min(70dvh, 520px); overflow: auto;
      border: 1px solid var(--shade-3); border-radius: var(--r-md); background: var(--white); box-shadow: var(--shadow-2);
      position: fixed; inset: auto;
    }
    .menu button {
      display: flex; align-items: center; gap: var(--s-2); width: 100%; min-height: 36px; padding: 0 var(--s-3);
      border: 0; border-radius: var(--r-sm); background: transparent; text-align: left; font-size: var(--fs-small); cursor: pointer;
    }
    .menu button:hover, .menu button:focus-visible { background: var(--hover); box-shadow: none; }
    .menu button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
    .menu button[aria-disabled] { color: var(--shade-6); cursor: default; }
    .menu button span { flex: 1; }
    .ext { color: var(--shade-6); }
    @media (max-width: 560px) { .hide-sm { display: none; } }
  `,
})
export class ActionMenu {
  readonly actions = input.required<UiAction[]>();
  /** How many common actions to show as buttons. */
  readonly inlineCount = input(3);
  readonly compact = input(false);
  readonly run = output<UiAction>();

  protected readonly menuId = `actions-menu-${++seq}`;
  private readonly trigger = viewChild<ElementRef<HTMLElement>>('trigger');
  private readonly menu = viewChild<ElementRef<HTMLElement>>('menu');

  private readonly usable = computed(() => this.actions().filter((a) => specFor(a.UiActionCode).kind !== 'hidden'));

  protected readonly inline = computed(() =>
    PRIMARY.map((code) => this.usable().find((a) => a.UiActionCode === code && a.CanExecute))
      .filter((a): a is UiAction => !!a)
      .slice(0, this.inlineCount()),
  );

  /** Everything else; runnable first, then the ones that cannot run now. */
  protected readonly rest = computed(() => {
    const shown = new Set(this.inline().map((a) => a.UiActionCode));
    const rest = this.usable().filter((a) => !shown.has(a.UiActionCode));
    return [...rest.filter((a) => a.CanExecute), ...rest.filter((a) => !a.CanExecute)];
  });

  protected icon(a: UiAction): IconName {
    return ICON[a.UiActionCode] ?? (this.isClassic(a) ? 'external' : 'folder');
  }

  protected isClassic(a: UiAction): boolean {
    return specFor(a.UiActionCode).kind === 'classic';
  }

  protected pick(a: UiAction): void {
    if (!a.CanExecute) return;
    this.menu()?.nativeElement.hidePopover();
    this.run.emit(a);
  }

  /** Places the menu under its button (kept inside the viewport) and focuses the first item. */
  protected onToggle(event: Event): void {
    const menu = this.menu()?.nativeElement;
    const btn = this.trigger()?.nativeElement;
    if (!menu || !btn || (event as ToggleEvent).newState !== 'open') return;
    const r = btn.getBoundingClientRect();
    const w = menu.offsetWidth;
    const h = menu.offsetHeight;
    const left = r.left + w <= window.innerWidth - 8 ? r.left : Math.max(8, r.right - w);
    const below = r.bottom + 4 + h <= window.innerHeight - 8;
    menu.style.left = `${left}px`;
    menu.style.top = `${below ? r.bottom + 4 : Math.max(8, r.top - 4 - h)}px`;
    menu.querySelector<HTMLElement>('[role=menuitem]:not([aria-disabled])')?.focus();
  }

  protected menuKey(event: KeyboardEvent): void {
    const items = [...(this.menu()?.nativeElement.querySelectorAll<HTMLElement>('[role=menuitem]') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    let next = -1;
    if (event.key === 'ArrowDown') next = (i + 1) % items.length;
    else if (event.key === 'ArrowUp') next = (i - 1 + items.length) % items.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    if (next < 0) return;
    event.preventDefault();
    items[next]?.focus();
  }
}
