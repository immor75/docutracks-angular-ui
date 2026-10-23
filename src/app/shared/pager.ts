import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Icon } from '../ui/icon';

export const PAGE_SIZES = [20, 50, 100] as const;

/** Range, page size and page buttons under a list. Stateless: the page owns the query. */
@Component({
  selector: 'app-pager',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="range" aria-live="polite">
      @if (total()) {
        {{ from() }}–{{ to() }} από <strong>{{ total() }}</strong>
      } @else if (!loading()) {
        0 {{ noun() }}
      }
    </p>
    <label class="size">
      <span>Ανά σελίδα</span>
      <select class="input" [value]="size()" (change)="sizeChange.emit(+$any($event.target).value)">
        @for (s of sizes; track s) {
          <option [value]="s" [selected]="s === size()">{{ s }}</option>
        }
      </select>
    </label>
    <nav class="pages" aria-label="Σελίδες">
      <button type="button" class="btn btn--ghost btn--icon" [disabled]="page() <= 1" (click)="go(1)" aria-label="Πρώτη σελίδα">
        <app-icon name="first-page" [size]="18" />
      </button>
      <button type="button" class="btn btn--ghost btn--icon" [disabled]="page() <= 1" (click)="go(page() - 1)" aria-label="Προηγούμενη σελίδα">
        <app-icon name="chevron-left" [size]="18" />
      </button>
      <span class="of">Σελίδα {{ page() }} από {{ pageCount() }}</span>
      <button type="button" class="btn btn--ghost btn--icon" [disabled]="page() >= pageCount()" (click)="go(page() + 1)" aria-label="Επόμενη σελίδα">
        <app-icon name="chevron-right" [size]="18" />
      </button>
      <button type="button" class="btn btn--ghost btn--icon" [disabled]="page() >= pageCount()" (click)="go(pageCount())" aria-label="Τελευταία σελίδα">
        <app-icon name="last-page" [size]="18" />
      </button>
    </nav>
  `,
  styles: `
    :host {
      display: flex; align-items: center; flex-wrap: wrap; gap: var(--s-2) var(--s-4);
      padding: var(--s-2) var(--s-4); border-top: 1px solid var(--shade-3); background: var(--white);
      font-size: var(--fs-small);
    }
    .range { margin: 0; flex: 1; color: var(--secondary); }
    .range strong { color: var(--body); font-weight: 600; }
    .size { display: flex; align-items: center; gap: var(--s-2); color: var(--secondary); }
    .size .input { min-height: 32px; }
    .pages { display: flex; align-items: center; gap: 2px; }
    .of { padding: 0 var(--s-2); white-space: nowrap; }
    @media (max-width: 520px) { .size { display: none; } }
  `,
})
export class Pager {
  readonly page = input.required<number>();
  readonly size = input.required<number>();
  readonly total = input.required<number>();
  /** True while the first page is loading: no "0 …" yet. */
  readonly loading = input(false);
  /** Plural noun for an empty list ("υποθέσεις", "έγγραφα"). */
  readonly noun = input('αποτελέσματα');

  readonly pageChange = output<number>();
  readonly sizeChange = output<number>();

  protected readonly sizes = PAGE_SIZES;
  protected readonly pageCount = computed(() => Math.max(1, Math.ceil(this.total() / this.size())));
  protected readonly from = computed(() => (this.page() - 1) * this.size() + 1);
  protected readonly to = computed(() => Math.min(this.page() * this.size(), this.total()));

  protected go(page: number): void {
    this.pageChange.emit(Math.min(Math.max(1, page), this.pageCount()));
  }
}
