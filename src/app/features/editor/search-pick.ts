import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, model, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Observable, map } from 'rxjs';
import { errorMessage } from '../../core/http';
import { Icon } from '../../ui/icon';
import { PageOf } from './editor-api';

let seq = 0;

/**
 * Server-side search with a checkbox list and "Περισσότερα" paging. Generic over the row type;
 * the parent passes how to search and how to label a row.
 */
@Component({
  selector: 'app-search-pick',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="search">
      <app-icon name="search" [size]="18" />
      <label class="sr-only" [for]="id">{{ label() }}</label>
      <input [id]="id" type="search" autocomplete="off" [placeholder]="placeholder()" [value]="term()" (input)="onInput($any($event.target).value)" (keydown.enter)="$event.preventDefault()" />
    </div>
    @if (selected().length) {
      <p class="count">{{ selected().length }} επιλεγμένα</p>
    }
    <ul class="rows" [attr.aria-label]="label()" [attr.aria-busy]="results.isLoading()">
      @for (row of rows(); track key()(row)) {
        <li>
          <label class="check">
            <input [type]="multi() ? 'checkbox' : 'radio'" [name]="id" [checked]="isSelected(row)" (change)="toggle(row)" />
            <span class="txt">
              <span class="main" [attr.title]="title()(row)">{{ title()(row) }}</span>
              @if (meta()(row)) {
                <small>{{ meta()(row) }}</small>
              }
            </span>
          </label>
        </li>
      } @empty {
        @if (!results.isLoading()) {
          <li class="empty">{{ results.error() ? 'Η αναζήτηση απέτυχε. ' + errorMessage(results.error()) : 'Δεν βρέθηκαν αποτελέσματα.' }}</li>
        }
      }
      @if (results.isLoading()) {
        @for (w of [70, 50, 60]; track $index) {
          <li class="skel-row"><span class="skel" [style.width.%]="w"></span></li>
        }
      }
    </ul>
    @if (rows().length < total() && !results.isLoading()) {
      <button type="button" class="btn btn--ghost more" (click)="page.set(page() + 1)">Περισσότερα ({{ rows().length }} από {{ total() }})</button>
    }
  `,
  styles: `
    :host { display: grid; gap: var(--s-2); min-height: 0; }
    .search { display: flex; align-items: center; gap: var(--s-2); padding: 0 var(--s-3); border: 1px solid var(--shade-4); border-radius: var(--r-md); color: var(--shade-6); }
    .search:focus-within { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
    .search input { flex: 1; min-width: 0; height: 36px; border: 0; background: transparent; }
    .search input:focus, .search input:focus-visible { outline: none; box-shadow: none; }
    .count { margin: 0; font-size: var(--fs-small); color: var(--accent-darker); }
    .rows {
      list-style: none; margin: 0; padding: var(--s-1) 0; display: grid; grid-template-columns: minmax(0, 1fr); align-content: start;
      height: min(46dvh, 380px); overflow-y: auto; border: 1px solid var(--shade-3); border-radius: var(--r-md);
    }
    li { min-width: 0; padding: 0 var(--s-3); }
    li:hover { background: var(--hover); }
    .check { align-items: flex-start; min-height: 40px; padding: var(--s-2) 0; }
    .check input { margin-top: 2px; }
    .txt { min-width: 0; display: grid; }
    .main { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    small { color: var(--secondary); font-size: var(--fs-tiny); line-height: var(--lh-tiny); }
    .empty { padding: var(--s-3); color: var(--secondary); font-size: var(--fs-small); }
    .skel-row { padding: var(--s-3); }
    .more { justify-self: center; color: var(--accent-dark); }
  `,
})
export class SearchPick<T> {
  protected readonly id = `sp-${++seq}`;
  protected readonly errorMessage = errorMessage;

  readonly search = input.required<(term: string, page: number) => Observable<PageOf<T>>>();
  readonly key = input.required<(row: T) => number>();
  readonly title = input.required<(row: T) => string>();
  readonly meta = input<(row: T) => string>(() => '');
  readonly label = input('Αναζήτηση');
  readonly placeholder = input('Αναζήτηση…');
  readonly multi = input(true);
  readonly selected = model<T[]>([]);

  protected readonly term = signal('');
  private readonly debounced = signal('');
  protected readonly page = signal(1);
  private timer: ReturnType<typeof setTimeout> | undefined;

  protected readonly results = rxResource({
    params: () => ({ term: this.debounced(), page: this.page() }),
    stream: ({ params }) => this.search()(params.term, params.page).pipe(map((p) => ({ ...p, page: params.page }))),
  });

  /** Pages accumulate until the term changes. */
  private readonly acc = linkedSignal<{ rows: T[]; total: number; page: number } | undefined, { rows: T[]; total: number }>({
    source: () => (this.results.hasValue() ? this.results.value() : undefined),
    computation: (cur, prev) => {
      if (!cur) return prev?.value ?? { rows: [], total: 0 };
      return cur.page === 1 || !prev ? cur : { rows: [...prev.value.rows, ...cur.rows], total: cur.total };
    },
  });
  protected readonly rows = computed(() => this.acc().rows);
  protected readonly total = computed(() => this.acc().total);

  protected onInput(v: string): void {
    this.term.set(v);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.page.set(1);
      this.debounced.set(v.trim());
    }, 300);
  }

  protected isSelected(row: T): boolean {
    const k = this.key()(row);
    return this.selected().some((s) => this.key()(s) === k);
  }

  protected toggle(row: T): void {
    const k = this.key()(row);
    if (!this.multi()) {
      this.selected.set([row]);
      return;
    }
    this.selected.update((l) => (l.some((s) => this.key()(s) === k) ? l.filter((s) => this.key()(s) !== k) : [...l, row]));
  }
}
