import { ChangeDetectionStrategy, Component, ElementRef, effect, input, output, untracked, viewChild } from '@angular/core';
import { Icon } from './icon';

let seq = 0;

/**
 * A modal on the native <dialog> element (focus trap, Esc, top layer from the browser).
 * Content goes in the body; elements marked `sheet-footer` go in the footer.
 */
@Component({
  selector: 'app-sheet',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(click)': 'backdrop($event)' },
  template: `
    <dialog #dlg class="sheet" [class.sheet--wide]="wide()" [attr.aria-labelledby]="id" (cancel)="onCancel($event)">
      @if (open()) {
        <header class="sheet__head">
          <div>
            <h2 [id]="id">{{ heading() }}</h2>
            @if (sub()) {
              <p>{{ sub() }}</p>
            }
          </div>
          <button type="button" class="btn btn--ghost btn--icon" (click)="closed.emit()" aria-label="Κλείσιμο">
            <app-icon name="close" />
          </button>
        </header>
        <div class="sheet__body"><ng-content /></div>
        <footer class="sheet__foot"><ng-content select="[sheet-footer]" /></footer>
      }
    </dialog>
  `,
  styles: `
    .sheet {
      width: min(560px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); padding: 0; border: 0;
      border-radius: var(--r-lg); background: var(--white); color: var(--body); box-shadow: var(--shadow-2);
    }
    .sheet--wide { width: min(880px, calc(100vw - 32px)); }
    .sheet::backdrop { background: rgba(0, 0, 0, 0.32); }
    .sheet[open] { display: flex; flex-direction: column; }
    .sheet__head { display: flex; justify-content: space-between; gap: var(--s-3); padding: var(--s-4) var(--s-4) var(--s-2) var(--s-5); }
    .sheet__head h2 { margin: 0; font-size: var(--fs-h3); line-height: var(--lh-h3); font-weight: 600; }
    .sheet__head p { margin: 2px 0 0; color: var(--secondary); font-size: var(--fs-small); }
    .sheet__body { display: grid; gap: var(--s-3); align-content: start; padding: var(--s-2) var(--s-5) var(--s-4); overflow: auto; min-height: 0; flex: 1; }
    .sheet__foot { display: flex; justify-content: flex-end; gap: var(--s-2); padding: var(--s-3) var(--s-5); border-top: 1px solid var(--shade-3); }
    .sheet__foot:empty { display: none; }
    @media (max-width: 560px) {
      .sheet, .sheet--wide { width: 100vw; max-width: 100vw; height: 100dvh; max-height: 100dvh; margin: 0; border-radius: 0; }
    }
  `,
})
export class Sheet {
  readonly open = input(false);
  readonly heading = input.required<string>();
  readonly sub = input('');
  readonly wide = input(false);
  readonly closed = output<void>();

  protected readonly id = `sheet-${++seq}`;
  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  constructor() {
    effect(() => {
      const isOpen = this.open();
      const el = this.dlg().nativeElement;
      untracked(() => {
        if (isOpen && !el.open) el.showModal();
        else if (!isOpen && el.open) el.close();
      });
    });
  }

  protected onCancel(event: Event): void {
    event.preventDefault();
    this.closed.emit();
  }

  protected backdrop(event: MouseEvent): void {
    if (event.target === this.dlg().nativeElement) this.closed.emit();
  }
}
