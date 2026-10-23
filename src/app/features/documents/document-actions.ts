import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output, viewChild } from '@angular/core';
import { DocumentAction } from '../../core/documents-models';
import { CLASSIC } from '../../core/paths';
import { Session } from '../../core/session';
import { Icon, IconName } from '../../ui/icon';
import { IN_APP, PAGE_ACTIONS } from './actions/doc-action-runner';

/** Shown as buttons, in this order, when they can run; the rest go in «Περισσότερα». */
const PRIMARY = ['UiAssign', 'UiAnswer', 'UiSign', 'UiSendToSign', 'UiSend', 'UiArchive', 'UiNotify', 'UiUnArchive', 'UiEdit'];

const ICON: Record<string, IconName> = {
  UiCancel: 'close',
  UiChangeCreator: 'user-check',
  UiFreeze: 'archive',
  UiUnfreeze: 'undo',
  UiAssign: 'user-add',
  UiUnAssign: 'undo',
  UiAnswer: 'return',
  UiSend: 'send',
  UiSendToChild: 'send',
  UiSendToFirstLevelChild: 'send',
  UiSendToSign: 'send',
  UiSign: 'edit',
  UiArchive: 'archive',
  UiUnArchive: 'undo',
  UiNotify: 'share',
  UiInform: 'share',
  UiReturn: 'return',
  UiEdit: 'edit',
  UiClone: 'copy',
  UiDelete: 'trash',
  UiViewHist: 'clock',
};

/** In this UI already: the history tab here, dialogs (IN_APP) and pages (PAGE_ACTIONS). */
const LOCAL = new Set(['UiViewHist']);
const inApp = (code: string) => LOCAL.has(code) || IN_APP.has(code) || PAGE_ACTIONS.has(code);

let seq = 0;

/**
 * The actions of a document. Those that can run now: the common ones as buttons, the rest
 * in a native popover menu. Those that cannot are listed too, greyed, with the server's reason,
 * so the user knows why instead of guessing (the Razor view only shows it on hover).
 */
@Component({
  selector: 'app-document-actions',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (a of inline(); track a.Code) {
      <a class="btn" [href]="href(a)" (click)="click($event, a)">
        <app-icon [name]="icon(a)" [size]="18" />
        <span>{{ a.Name }}</span>
        @if (!isInApp(a)) {
          <app-icon name="external" [size]="14" class="ext" /><span class="sr-only">(κλασικό UI)</span>
        }
      </a>
    }
    @if (actions().length > inline().length) {
      <button #trigger type="button" class="btn" [attr.popovertarget]="menuId" aria-haspopup="menu">
        <app-icon name="more" [size]="18" />
        <span>Περισσότερα</span>
      </button>
      <div
        #menu
        [id]="menuId"
        tabindex="-1"
        popover
        class="menu"
        role="menu"
        aria-label="Ενέργειες εγγράφου"
        (toggle)="onToggle($event)"
        (keydown)="menuKey($event)"
      >
        @if (more().length) {
          <p class="menu__title">Διαθέσιμες</p>
          @for (a of more(); track a.Code) {
            <a role="menuitem" class="item" [href]="href(a)" (click)="click($event, a)">
              <app-icon [name]="icon(a)" [size]="16" />
              <span>{{ a.Name }}</span>
              @if (!isInApp(a)) {
                <app-icon name="external" [size]="14" class="ext" /><span class="sr-only">(κλασικό UI)</span>
              }
            </a>
          }
        }
        @if (off().length) {
          <p class="menu__title">Μη διαθέσιμες τώρα</p>
          @for (a of off(); track a.Code) {
            <div role="menuitem" class="item item--off" aria-disabled="true" tabindex="-1">
              <app-icon [name]="icon(a)" [size]="16" />
              <span>
                {{ a.Name }}
                @if (a.Reason) {
                  <small>{{ a.Reason }}</small>
                }
              </span>
            </div>
          }
        }
        @if (anyClassic()) {
          <p class="menu__note">
            <app-icon name="external" [size]="14" /> Ανοίγουν στο κλασικό UI.
          </p>
        }
      </div>
    }
  `,
  styles: `
    :host { display: flex; flex-wrap: wrap; gap: var(--s-2); }
    .menu {
      position: fixed; inset: auto; margin: 0; width: min(380px, calc(100vw - 32px)); max-height: min(70dvh, 560px); overflow: auto;
      padding: var(--s-2); border: 1px solid var(--shade-3); border-radius: var(--r-lg); background: var(--white); box-shadow: var(--shadow-2);
    }
    .menu__title { margin: var(--s-2) var(--s-2) var(--s-1); font-size: var(--fs-tiny); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--secondary); }
    .menu__note { margin: var(--s-2); padding-top: var(--s-2); border-top: 1px solid var(--shade-2); font-size: var(--fs-tiny); color: var(--secondary); }
    .item {
      display: flex; align-items: flex-start; gap: var(--s-2); padding: var(--s-2); border-radius: var(--r-md);
      color: var(--body); text-decoration: none; font-size: var(--fs-small); line-height: var(--lh-small);
    }
    a.item:hover, .item:focus-visible { background: var(--hover); outline: 2px solid var(--accent); outline-offset: -2px; }
    a.item:hover { outline: none; }
    .item app-icon { margin-top: 1px; }
    .item--off { color: var(--shade-6); }
    .ext { margin-left: auto; color: var(--secondary); }
    .btn .ext { margin-left: 0; }
    .menu__note app-icon { vertical-align: -2px; }
    .item--off small { display: block; margin-top: 2px; font-size: var(--fs-tiny); line-height: var(--lh-tiny); color: var(--secondary); }
  `,
})
export class DocumentActions {
  private readonly session = inject(Session);

  readonly documentId = input.required<number>();
  readonly actions = input.required<DocumentAction[]>();
  readonly inlineCount = input(3);
  /** An action this UI handles itself: «Ιστορικό» opens the tab, the rest open their dialog. */
  readonly local = output<DocumentAction>();

  protected readonly menuId = `doc-actions-${++seq}`;
  private readonly menu = viewChild<ElementRef<HTMLElement>>('menu');
  private readonly trigger = viewChild<ElementRef<HTMLElement>>('trigger');

  private readonly enabled = computed(() => this.actions().filter((a) => a.Enabled));
  protected readonly inline = computed(() =>
    PRIMARY.map((c) => this.enabled().find((a) => a.Code === c))
      .filter((a): a is DocumentAction => !!a)
      .slice(0, this.inlineCount()),
  );
  protected readonly more = computed(() => this.enabled().filter((a) => !this.inline().includes(a)));
  protected readonly off = computed(() => this.actions().filter((a) => !a.Enabled));

  /** Some enabled action in the menu still opens the classic UI: say so once, under the list. */
  protected readonly anyClassic = computed(() => this.more().some((a) => !inApp(a.Code)));

  protected isInApp(a: DocumentAction): boolean {
    return inApp(a.Code);
  }

  protected icon(a: DocumentAction): IconName {
    return ICON[a.Code] ?? 'file';
  }

  /**
   * In-app actions keep the classic URL as their href: a middle or Ctrl click still opens the
   * classic form in a new tab, a plain click opens the dialog here.
   */
  protected href(a: DocumentAction): string {
    return LOCAL.has(a.Code) ? '#' : CLASSIC.documentAction(this.session.groupId(), a.Code, this.documentId());
  }

  protected click(event: MouseEvent, a: DocumentAction): void {
    if (!inApp(a.Code) || event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    (event.currentTarget as HTMLElement).closest<HTMLElement>('[popover]')?.hidePopover();
    this.local.emit(a);
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
    menu.querySelector<HTMLElement>('[role=menuitem]')?.focus();
  }

  /** Arrows, Home and End move between items (WAI-ARIA menu). */
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
