import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DocumentFolder } from '../../core/documents-models';
import { Icon } from '../../ui/icon';
import { DocumentListStore } from './document-list.store';

/**
 * Sidebar of the document list: the folders the server allows, as in the Razor catalog
 * (Κύρια, Εισερχόμενα › Εκκρεμή, …). Sections fold; the one holding the current folder is open.
 * Picking a folder keeps only `f`: it starts without search, on page 1, with the default period.
 */
@Component({
  selector: 'app-folder-nav',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav aria-label="Φάκελοι εγγράφων">
      @if (store.filters.isLoading() && !store.folders().length) {
        @for (_ of [1, 2, 3, 4, 5, 6]; track $index) {
          <span class="skel nav-skel"></span>
        }
      } @else if (store.filters.error()) {
        <p class="note">Δεν φορτώθηκαν οι φάκελοι.</p>
        <button type="button" class="btn" (click)="store.filters.reload()">Δοκιμάστε ξανά</button>
      }
      <ul class="tree">
        @for (f of store.folders(); track f.Label + (f.Key ?? '')) {
          <li>
            @if (f.Children?.length) {
              <div class="section" [class.section--current]="f.Key === current()">
                <button
                  type="button"
                  class="toggle"
                  [attr.aria-expanded]="isOpen(f)"
                  [attr.aria-controls]="'nav-' + $index"
                  [attr.aria-label]="(isOpen(f) ? 'Σύμπτυξη: ' : 'Ανάπτυξη: ') + f.Label"
                  (click)="toggle(f)"
                >
                  <app-icon [name]="isOpen(f) ? 'chevron-down' : 'chevron-right'" [size]="16" />
                </button>
                @if (f.Key) {
                  <a [routerLink]="[]" [queryParams]="{ f: f.Key }" [attr.aria-current]="f.Key === current() ? 'page' : null" (click)="picked.emit()">
                    {{ f.Label }}
                  </a>
                } @else {
                  <button type="button" class="section__label" (click)="toggle(f)" tabindex="-1" aria-hidden="true">{{ f.Label }}</button>
                }
              </div>
              <ul class="sub" [id]="'nav-' + $index" [hidden]="!isOpen(f)">
                @for (c of f.Children; track c.Key) {
                  <li>
                    <a [routerLink]="[]" [queryParams]="{ f: c.Key }" [attr.aria-current]="c.Key === current() ? 'page' : null" (click)="picked.emit()">
                      {{ c.Label }}
                    </a>
                  </li>
                }
              </ul>
            } @else {
              <a class="top" [routerLink]="[]" [queryParams]="{ f: f.Key }" [attr.aria-current]="f.Key === current() ? 'page' : null" (click)="picked.emit()">
                {{ f.Label }}
              </a>
            }
          </li>
        }
      </ul>
    </nav>
  `,
  styles: `
    :host { display: block; padding: var(--s-3) var(--s-2); }
    ul { list-style: none; margin: 0; padding: 0; }
    .tree > li + li { margin-top: 2px; }
    a, .section__label {
      display: block; flex: 1; min-width: 0; padding: 6px var(--s-3); border-radius: var(--r-md);
      color: var(--body); text-decoration: none; font-size: var(--fs-small); line-height: var(--lh-small);
      text-align: left; border: 0; background: none; font-family: inherit; cursor: pointer;
    }
    a:hover, .section__label:hover { background: var(--hover); }
    a[aria-current='page'] { background: var(--accent-tint-strong); color: var(--accent-darker); font-weight: 500; }
    .top, .section > a, .section__label { font-weight: 500; }
    .section { display: flex; align-items: center; }
    .section > a, .section__label { padding-left: 2px; }
    .top { padding-left: 30px; }
    .toggle {
      display: grid; place-items: center; flex: none; width: 28px; height: 28px; border: 0; border-radius: var(--r-sm);
      background: none; color: var(--secondary); cursor: pointer;
    }
    .toggle:hover { background: var(--hover); color: var(--body); }
    .sub { margin: 2px 0 var(--s-2) 28px; }
    .sub a { padding-left: var(--s-3); }
    .nav-skel { height: 28px; margin: var(--s-2) var(--s-3); }
    .note { margin: var(--s-3); font-size: var(--fs-small); color: var(--secondary); }
    .btn { margin: 0 var(--s-3); }
  `,
})
export class FolderNav {
  protected readonly store = inject(DocumentListStore);
  readonly picked = output<void>();

  protected readonly current = computed(() => this.store.folder()?.key ?? null);

  /** Sections the user opened or closed; the current folder's section starts open. */
  private readonly open = linkedSignal<string | null, ReadonlySet<string>>({
    source: () => this.current(),
    computation: (cur, prev) => {
      const next = new Set(prev?.value ?? []);
      const holder = this.store.folders().find((f) => f.Key === cur || f.Children?.some((c) => c.Key === cur));
      if (holder) next.add(holder.Label);
      return next;
    },
  });

  protected isOpen(f: DocumentFolder): boolean {
    return this.open().has(f.Label);
  }

  protected toggle(f: DocumentFolder): void {
    this.open.update((s) => {
      const next = new Set(s);
      if (next.has(f.Label)) next.delete(f.Label);
      else next.add(f.Label);
      return next;
    });
  }
}
