import { ChangeDetectionStrategy, Component, computed, inject, input, model, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { of, switchMap, timer } from 'rxjs';
import { DocumentsApi } from '../../../core/documents-api';
import { ThematicFolder } from '../../../core/documents-models';
import { Session } from '../../../core/session';
import { Icon } from '../../../ui/icon';

let seq = 0;

/**
 * «Θεματικοί Φάκελοι» of UiArchive: search the classifiers, pick several, or add a new name
 * when the setting allows it (AllowNewThematicalFolderByUsers). The results are a plain list
 * of buttons under the box, so it works the same with a keyboard, a screen reader and touch.
 */
@Component({
  selector: 'app-thematic-picker',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (selected().length) {
      <ul class="chips" [attr.aria-label]="label() + ': επιλεγμένοι'">
        @for (f of selected(); track f.Id ?? f.Name) {
          <li class="chip">
            <span>
              {{ f.Name }}
              @if (f.Id === null) {
                <small>(νέος)</small>
              }
            </span>
            <button type="button" (click)="remove(f)" [attr.aria-label]="'Αφαίρεση ' + f.Name">
              <app-icon name="close" [size]="14" />
            </button>
          </li>
        }
      </ul>
    }
    <div class="search">
      <app-icon name="search" [size]="16" />
      <input
        type="search"
        class="input"
        [id]="inputId"
        autocomplete="off"
        placeholder="Αναζήτηση θεματικού φακέλου…"
        [attr.aria-label]="label() + ': αναζήτηση'"
        [attr.aria-describedby]="describedBy()"
        [attr.aria-invalid]="invalid() || null"
        [value]="q()"
        (input)="q.set($any($event.target).value)"
        (keydown.enter)="$event.preventDefault()"
      />
    </div>
    @if (q().trim()) {
      <ul class="results" [attr.aria-label]="'Αποτελέσματα για ' + q().trim()" [attr.aria-busy]="results.isLoading()">
        @for (f of options(); track f.Id) {
          <li>
            <button type="button" class="opt" (click)="add(f)">
              {{ f.Name }}
              @if (f.Path) {
                <small>{{ f.Path }}</small>
              }
            </button>
          </li>
        }
        @if (canCreate()) {
          <li>
            <button type="button" class="opt opt--new" (click)="add({ Id: null, Name: q().trim() })">
              <app-icon name="plus" [size]="14" /> Νέος φάκελος «{{ q().trim() }}»
            </button>
          </li>
        }
        @if (!results.isLoading() && !options().length && !canCreate()) {
          <li class="none">Δεν βρέθηκε θεματικός φάκελος.</li>
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
    .results { display: grid; max-height: 200px; overflow: auto; margin: 0; padding: var(--s-1); list-style: none; border: 1px solid var(--shade-3); border-radius: var(--r-md); }
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
export class ThematicPicker {
  private readonly api = inject(DocumentsApi);
  private readonly session = inject(Session);

  readonly label = input('Θεματικοί Φάκελοι');
  readonly allowNew = input(false);
  readonly invalid = input(false);
  readonly describedBy = input<string | null>(null);
  readonly selected = model<ThematicFolder[]>([]);

  protected readonly inputId = `thematic-${++seq}`;
  protected readonly q = signal('');

  /** 250 ms after the last key, as the list search. */
  protected readonly results = rxResource({
    params: () => ({ q: this.q().trim(), groupId: this.session.groupId() }),
    stream: ({ params }) =>
      params.q && params.groupId
        ? timer(250).pipe(switchMap(() => this.api.thematicFolders(params.groupId!, params.q)))
        : of([] as ThematicFolder[]),
  });

  protected readonly options = computed(() => {
    const taken = new Set(this.selected().map((f) => f.Id));
    return (this.results.hasValue() ? this.results.value() : []).filter((f) => !taken.has(f.Id));
  });

  protected readonly canCreate = computed(() => {
    const name = this.q().trim().toLocaleLowerCase('el');
    if (!this.allowNew() || !name || this.results.isLoading()) return false;
    const all = [...(this.results.hasValue() ? this.results.value() : []), ...this.selected()];
    return !all.some((f) => f.Name.toLocaleLowerCase('el') === name);
  });

  protected add(f: ThematicFolder): void {
    this.selected.update((l) => [...l, f]);
    this.q.set('');
  }

  protected remove(f: ThematicFolder): void {
    this.selected.update((l) => l.filter((x) => x !== f));
  }
}
