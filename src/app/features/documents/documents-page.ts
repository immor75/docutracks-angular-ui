import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, linkedSignal, signal, viewChild } from '@angular/core';
import { DocumentColumnKey } from '../../core/documents-models';
import { errorMessage } from '../../core/http';
import { CLASSIC } from '../../core/paths';
import { Session } from '../../core/session';
import { formatDate } from '../../shared/format';
import { Pager } from '../../shared/pager';
import { Icon } from '../../ui/icon';
import { DocumentListStore, flattenFolders } from './document-list.store';
import { DocumentQuery } from './document-query';
import { DocumentTable } from './document-table';
import { FolderNav } from './folder-nav';

/** Κατάλογος εγγράφων: folders, search, period, columns, table and pages. */
@Component({
  selector: 'app-documents-page',
  imports: [Icon, FolderNav, DocumentTable, Pager],
  providers: [DocumentQuery, DocumentListStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './documents-page.html',
  styleUrl: './documents-page.css',
  host: { '(document:keydown)': 'onGlobalKey($event)' },
})
export class DocumentsPage {
  protected readonly store = inject(DocumentListStore);
  protected readonly query = inject(DocumentQuery);
  private readonly session = inject(Session);

  protected readonly errorMessage = errorMessage;
  protected readonly formatDate = formatDate;
  private readonly searchBox = viewChild.required<ElementRef<HTMLInputElement>>('search');

  protected readonly navOpen = signal(false);

  /** What is typed; the URL follows 250 ms after the last key. */
  protected readonly searchText = linkedSignal(() => this.query.state().q);
  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  /** «Εισερχόμενα › Εκκρεμή»: the section as a small line above the folder name. */
  protected readonly titlePath = computed(() => {
    const key = this.store.folder()?.key;
    return flattenFolders(this.store.folders()).find((f) => f.key === key)?.path ?? [];
  });

  protected readonly periodText = computed(() => {
    const p = this.store.page()?.Period;
    if (!p) return '';
    return p.From ? `${formatDate(p.From)} – ${formatDate(p.To)}` : `έως ${formatDate(p.To)}`;
  });

  protected readonly newDocumentHref = computed(() => CLASSIC.newDocument(this.session.groupId()));
  protected readonly classicListHref = computed(() => CLASSIC.documents(this.session.groupId()));

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
    this.query.patch({ searchType }, { replace: !this.query.state().q });
  }

  protected setPeriod(event: Event): void {
    const period = Number((event.target as HTMLSelectElement).value);
    this.query.patch({ period });
  }

  protected setDate(which: 'from' | 'to', event: Event): void {
    const value = (event.target as HTMLInputElement).value || null;
    this.query.patch({ period: 0, [which]: value });
  }

  protected isChosen(key: DocumentColumnKey): boolean {
    return this.store.chosenColumns().includes(key);
  }

  /** `/` focuses search, Esc closes the drawer. */
  protected onGlobalKey(event: KeyboardEvent): void {
    const t = event.target as HTMLElement;
    const typing = t.closest('input, textarea, select, [contenteditable]');
    if (event.key === '/' && !typing) {
      event.preventDefault();
      this.searchBox().nativeElement.focus();
    } else if (event.key === 'Escape' && !typing && this.navOpen() && !document.querySelector(':popover-open, dialog[open]')) {
      this.navOpen.set(false);
    }
  }
}
