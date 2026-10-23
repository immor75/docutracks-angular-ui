import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { FoldersApi } from '../../core/folders-api';
import { UiAction } from '../../core/models';
import { Session } from '../../core/session';
import { specFor } from '../actions/action-catalog';
import { ActionDialog } from '../actions/action-dialog';
import { ActionMenu } from '../actions/action-menu';
import { ActionRunner } from '../actions/action-runner';
import { errorMessage } from '../../core/http';
import { Icon } from '../../ui/icon';
import { FiltersPanel } from './filters-panel';
import { FolderListStore } from './folder-list.store';
import { FolderQuery, SEARCH_TYPES, STATUSES, activeFilterCount } from './folder-query';
import { FolderTable } from './folder-table';
import { formatDate } from './format';
import { Pager } from './pager';
import { TypeNav } from './type-nav';

interface Chip {
  id: string;
  label: string;
  remove: () => void;
}

@Component({
  selector: 'app-folder-list-page',
  imports: [RouterOutlet, Icon, TypeNav, FolderTable, Pager, FiltersPanel, ActionMenu, ActionDialog],
  providers: [FolderQuery, FolderListStore, ActionRunner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './list-page.html',
  styleUrl: './list-page.css',
  host: { '(document:keydown)': 'onGlobalKey($event)' },
})
export class FolderListPage {
  protected readonly store = inject(FolderListStore);
  protected readonly query = inject(FolderQuery);
  private readonly router = inject(Router);
  private readonly api = inject(FoldersApi);
  private readonly session = inject(Session);
  protected readonly runner = inject(ActionRunner);

  protected readonly searchTypes = SEARCH_TYPES;
  protected readonly errorMessage = errorMessage;
  private readonly searchBox = viewChild.required<ElementRef<HTMLInputElement>>('search');

  /** What is typed; the URL follows 250 ms after the last key. */
  protected readonly searchText = linkedSignal(() => this.query.state().q);
  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly navOpen = signal(false);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  /** Id of the folder open in the side panel, from `/<id>?…`. */
  protected readonly openId = computed(() => {
    const m = /^\/(\d+)(?:[?#]|$)/.exec(this.url());
    return m ? Number(m[1]) : null;
  });

  protected readonly filterCount = computed(() => activeFilterCount(this.query.state()));

  protected readonly chips = computed<Chip[]>(() => {
    const s = this.query.state();
    const chips: Chip[] = [];
    for (const id of s.statuses) {
      const label = STATUSES.find((x) => x.id === id)?.label ?? String(id);
      chips.push({ id: 's' + id, label, remove: () => this.query.patch({ statuses: s.statuses.filter((x) => x !== id) }) });
    }
    if (s.from) chips.push({ id: 'from', label: `Από ${formatDate(s.from)}`, remove: () => this.query.patch({ from: null }) });
    if (s.to) chips.push({ id: 'to', label: `Έως ${formatDate(s.to)}`, remove: () => this.query.patch({ to: null }) });
    if (s.shared) chips.push({ id: 'sh', label: 'Κοινής χρήσης', remove: () => this.query.patch({ shared: false }) });
    if (s.unread) chips.push({ id: 'ur', label: 'Αδιάβαστες', remove: () => this.query.patch({ unread: false }) });
    if (s.unassigned) chips.push({ id: 'na', label: 'Χωρίς χειριστή', remove: () => this.query.patch({ unassigned: false }) });
    return chips;
  });

  /**
   * Mass actions: one `actions` call for all ticked folders; an action is offered when it
   * supports mass use and every selected folder can run it now.
   */
  protected readonly massActions = rxResource({
    params: () => {
      const ids = [...this.store.selection()];
      const userId = this.session.user()?.Id;
      const groupId = this.session.groupId();
      return ids.length && userId && groupId ? { ids, userId, groupId } : undefined;
    },
    stream: ({ params }) =>
      this.api.actionsFor(params.userId, params.groupId, params.ids).pipe(
        map((byFolder) => {
          const lists = params.ids.map((id) => byFolder.get(id) ?? []);
          return (lists[0] ?? []).filter(
            (a) =>
              specFor(a.UiActionCode).mass &&
              lists.every((l) => l.some((x) => x.UiActionCode === a.UiActionCode && x.CanExecute)),
          );
        }),
      ),
  });

  protected runMass(action: UiAction): void {
    const targets = this.store.selectedRows().map((r) => ({ id: r.IdFolder, name: r.FolderName || r.FolderTypeAndNumber }));
    this.runner.open(action, targets, this.store.selectedInstance()?.Id ?? null);
  }

  protected newFolder(): void {
    const inst = this.store.selectedInstance()?.Id;
    void this.router.navigateByUrl(`/new?back=${encodeURIComponent(this.router.url)}${inst ? '&inst=' + inst : ''}`);
  }

  protected onSearchInput(value: string): void {
    this.searchText.set(value);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.query.patch({ q: value }, { replace: true }), 250);
  }

  protected submitSearch(event: Event): void {
    event.preventDefault();
    clearTimeout(this.searchTimer);
    this.query.patch({ q: this.searchText() });
  }

  protected clearSearch(): void {
    clearTimeout(this.searchTimer);
    this.searchText.set('');
    this.query.patch({ q: '' });
    this.searchBox().nativeElement.focus();
  }

  protected setSearchType(event: Event): void {
    const searchType = Number((event.target as HTMLSelectElement).value);
    if (this.query.state().q) this.query.patch({ searchType });
    else this.query.patch({ searchType }, { replace: true });
  }

  protected closeDetail(): void {
    void this.router.navigate(['/'], { queryParamsHandling: 'preserve' });
  }

  /** `/` focuses search, Esc closes the panel or the drawer. */
  protected onGlobalKey(event: KeyboardEvent): void {
    const t = event.target as HTMLElement;
    const typing = t.closest('input, textarea, select, [contenteditable]');
    if (event.key === 'n' && !typing && !event.ctrlKey && !event.metaKey && !event.altKey && !document.querySelector('dialog[open]')) {
      event.preventDefault();
      this.newFolder();
    } else if (event.key === '/' && !typing) {
      event.preventDefault();
      this.searchBox().nativeElement.focus();
    } else if (event.key === 'Escape' && !typing && !document.querySelector(':popover-open, dialog[open]')) {
      if (this.navOpen()) this.navOpen.set(false);
      else if (this.openId() !== null) this.closeDetail();
    }
  }
}
