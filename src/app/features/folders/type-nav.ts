import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FolderListStore } from './folder-list.store';
import { FolderQuery } from './folder-query';

/** Sidebar with the folder types (instances) the current group can see. */
@Component({
  selector: 'app-type-nav',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav aria-label="Είδη υποθέσεων">
      @if (store.instances.isLoading() && !store.typeGroups().length) {
        @for (_ of [1, 2, 3, 4, 5]; track $index) {
          <span class="skel nav-skel"></span>
        }
      } @else if (store.instances.error()) {
        <p class="note">Δεν φορτώθηκαν τα είδη υποθέσεων.</p>
        <button type="button" class="btn" (click)="store.instances.reload()">Δοκιμάστε ξανά</button>
      } @else if (!store.typeGroups().length) {
        <p class="note">Η υπηρεσία δεν έχει είδη υποθέσεων. Επιλέξτε άλλη υπηρεσία από την επάνω μπάρα.</p>
      }
      @for (group of store.typeGroups(); track group.title) {
        <h2 class="group">{{ group.title }}</h2>
        <ul>
          @for (inst of group.instances; track inst.Id) {
            <li>
              <a
                [routerLink]="['/']"
                [queryParams]="{ t: inst.Id }"
                [attr.aria-current]="inst.Id === query.state().type ? 'page' : null"
                (click)="picked.emit()"
                >{{ inst.InstanceName }}</a
              >
            </li>
          }
        </ul>
      }
    </nav>
  `,
  styles: `
    :host { display: block; padding: var(--s-3) var(--s-2); }
    .group {
      margin: var(--s-4) var(--s-3) var(--s-1); font-size: var(--fs-tiny); line-height: var(--lh-tiny);
      font-weight: 500; text-transform: uppercase; letter-spacing: 0.04em; color: var(--secondary);
    }
    .group:first-of-type { margin-top: var(--s-1); }
    ul { list-style: none; margin: 0; padding: 0; }
    a {
      display: block; padding: 6px var(--s-3); border-radius: var(--r-md);
      color: var(--body); text-decoration: none; font-size: var(--fs-small); line-height: var(--lh-small);
    }
    a:hover { background: var(--hover); }
    a[aria-current='page'] { background: var(--accent-tint-strong); color: var(--accent-darker); font-weight: 500; }
    .nav-skel { height: 28px; margin: var(--s-2) var(--s-3); }
    .note { margin: var(--s-3); font-size: var(--fs-small); color: var(--secondary); }
    .btn { margin: 0 var(--s-3); }
  `,
})
export class TypeNav {
  protected readonly store = inject(FolderListStore);
  protected readonly query = inject(FolderQuery);
  readonly picked = output<void>();
}
