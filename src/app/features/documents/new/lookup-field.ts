import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Observable, of, switchMap, timer } from 'rxjs';
import { errorMessage } from '../../../core/http';
import { Icon } from '../../../ui/icon';

export interface LookupItem {
  /** null: a new entry with this title (a new contact). */
  id: number | null;
  title: string;
  meta?: string;
}

let seq = 0;

/**
 * A search box that adds entries as chips: Αποστολέας, Λοιποί αποδέκτες, Σχετικά έγγραφα.
 * Results appear only while typing, as a list of buttons, so the form stays short; when the
 * field allows it, the typed text can be kept as a new entry.
 */
@Component({
  selector: 'app-lookup-field',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (value().length) {
      <ul class="chips" [attr.aria-label]="label() + ': επιλεγμένα'">
        @for (v of value(); track v.id ?? v.title) {
          <li class="chip">
            <span>{{ v.title }}@if (v.id === null) { <small>(νέα)</small> }</span>
            <button type="button" (click)="remove(v)" [attr.aria-label]="'Αφαίρεση ' + v.title"><app-icon name="close" [size]="14" /></button>
          </li>
        }
      </ul>
    }
    @if (multi() || !value().length) {
      <div class="search">
        <app-icon name="search" [size]="16" />
        <input
          type="search"
          class="input"
          [id]="inputId()"
          autocomplete="off"
          [placeholder]="placeholder()"
          [attr.aria-describedby]="describedBy()"
          [attr.aria-invalid]="invalid() || null"
          [value]="q()"
          (input)="q.set($any($event.target).value)"
          (keydown.enter)="$event.preventDefault()"
        />
      </div>
    }
    @if (q().trim().length >= 2) {
      <ul class="results" [attr.aria-label]="'Αποτελέσματα για ' + q().trim()" [attr.aria-busy]="results.isLoading()">
        @for (r of options(); track r.id) {
          <li>
            <button type="button" class="opt" (click)="add(r)">
              {{ r.title }}
              @if (r.meta) {
                <small>{{ r.meta }}</small>
              }
            </button>
          </li>
        }
        @if (allowNew() && !results.isLoading()) {
          <li>
            <button type="button" class="opt opt--new" (click)="add({ id: null, title: q().trim() })">
              <app-icon name="plus" [size]="14" /> {{ newLabel() }} «{{ q().trim() }}»
            </button>
          </li>
        }
        @if (results.error()) {
          <li class="none" role="alert">Η αναζήτηση απέτυχε. {{ errorMessage(results.error()) }}</li>
        } @else if (!results.isLoading() && !options().length && !allowNew()) {
          <li class="none">Δεν βρέθηκαν αποτελέσματα.</li>
        }
      </ul>
    }
  `,
  styles: `
    :host { display: grid; gap: var(--s-2); }
    .chips { display: flex; flex-wrap: wrap; gap: var(--s-1); margin: 0; padding: 0; list-style: none; }
    .chip {
      display: inline-flex; align-items: center; gap: 4px; padding: 2px 4px 2px 10px; border-radius: var(--r-pill);
      background: var(--accent-tint); color: var(--accent-darker); font-size: var(--fs-small);
    }
    .chip small { color: var(--secondary); }
    .chip button { display: grid; place-items: center; width: 24px; height: 24px; padding: 0; border: 0; border-radius: 50%; background: none; color: inherit; cursor: pointer; }
    .chip button:hover { background: var(--hover); }
    .search { position: relative; }
    .search app-icon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--secondary); pointer-events: none; }
    .search .input { width: 100%; padding-left: 32px; }
    .results { display: grid; max-height: 220px; overflow: auto; margin: 0; padding: var(--s-1); list-style: none; border: 1px solid var(--shade-3); border-radius: var(--r-md); }
    .opt {
      display: block; width: 100%; padding: var(--s-1) var(--s-2); border: 0; border-radius: var(--r-sm); background: none;
      color: var(--body); text-align: left; font: inherit; font-size: var(--fs-small); cursor: pointer;
    }
    .opt:hover { background: var(--hover); }
    .opt small { display: block; color: var(--secondary); font-size: var(--fs-tiny); }
    .opt--new { display: flex; align-items: center; gap: 4px; color: var(--accent-dark); }
    .none { padding: var(--s-1) var(--s-2); color: var(--secondary); font-size: var(--fs-small); }
  `,
})
export class LookupField {
  readonly label = input.required<string>();
  readonly search = input.required<(term: string) => Observable<LookupItem[]>>();
  readonly value = input<LookupItem[]>([]);
  readonly multi = input(true);
  readonly allowNew = input(false);
  readonly newLabel = input('Νέα επαφή');
  readonly placeholder = input('Αναζήτηση…');
  readonly invalid = input(false);
  readonly describedBy = input<string | null>(null);
  /** Lets the page's label point at the box. */
  readonly inputId = input(`lookup-${++seq}`);
  readonly valueChange = output<LookupItem[]>();

  protected readonly errorMessage = errorMessage;
  protected readonly q = signal('');

  protected readonly results = rxResource({
    params: () => ({ q: this.q().trim() }),
    stream: ({ params }) => (params.q.length >= 2 ? timer(250).pipe(switchMap(() => this.search()(params.q))) : of([] as LookupItem[])),
  });
  protected readonly options = computed(() => {
    const taken = new Set(this.value().map((v) => v.id));
    return (this.results.hasValue() ? this.results.value() : []).filter((r) => !taken.has(r.id));
  });

  protected add(item: LookupItem): void {
    this.valueChange.emit(this.multi() ? [...this.value(), item] : [item]);
    this.q.set('');
  }

  protected remove(item: LookupItem): void {
    this.valueChange.emit(this.value().filter((v) => v !== item));
  }
}
