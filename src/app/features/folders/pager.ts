import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Icon } from '../../ui/icon';
import { FolderListStore } from './folder-list.store';
import { FolderQuery, PAGE_SIZES } from './folder-query';

@Component({
  selector: 'app-pager',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="range" aria-live="polite">
      @if (store.total()) {
        {{ from() }}–{{ to() }} από <strong>{{ store.total() }}</strong>
      } @else if (!store.firstLoad()) {
        0 υποθέσεις
      }
    </p>
    <label class="size">
      <span>Ανά σελίδα</span>
      <select class="input" [value]="state().size" (change)="setSize($event)">
        @for (s of sizes; track s) {
          <option [value]="s" [selected]="s === state().size">{{ s }}</option>
        }
      </select>
    </label>
    <nav class="pages" aria-label="Σελίδες">
      <button type="button" class="btn btn--ghost btn--icon" [disabled]="state().page <= 1" (click)="go(1)" aria-label="Πρώτη σελίδα">
        <app-icon name="first-page" [size]="18" />
      </button>
      <button type="button" class="btn btn--ghost btn--icon" [disabled]="state().page <= 1" (click)="go(state().page - 1)" aria-label="Προηγούμενη σελίδα">
        <app-icon name="chevron-left" [size]="18" />
      </button>
      <span class="of">Σελίδα {{ state().page }} από {{ store.pageCount() }}</span>
      <button type="button" class="btn btn--ghost btn--icon" [disabled]="state().page >= store.pageCount()" (click)="go(state().page + 1)" aria-label="Επόμενη σελίδα">
        <app-icon name="chevron-right" [size]="18" />
      </button>
      <button type="button" class="btn btn--ghost btn--icon" [disabled]="state().page >= store.pageCount()" (click)="go(store.pageCount())" aria-label="Τελευταία σελίδα">
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
  protected readonly store = inject(FolderListStore);
  private readonly query = inject(FolderQuery);
  protected readonly state = this.query.state;
  protected readonly sizes = PAGE_SIZES;

  protected readonly from = computed(() => (this.state().page - 1) * this.state().size + 1);
  protected readonly to = computed(() => Math.min(this.state().page * this.state().size, this.store.total()));

  protected go(page: number): void {
    this.query.patch({ page: Math.min(Math.max(1, page), this.store.pageCount()) });
  }

  protected setSize(event: Event): void {
    this.query.patch({ size: Number((event.target as HTMLSelectElement).value) });
  }
}
