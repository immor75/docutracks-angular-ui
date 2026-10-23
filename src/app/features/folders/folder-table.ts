import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FoldersApi } from '../../core/folders-api';
import { FolderListItem } from '../../core/models';
import { Icon } from '../../ui/icon';
import { FolderListStore } from './folder-list.store';
import { FolderQuery, SortColumn } from './folder-query';
import { dash, formatDate, statusKind } from './format';

interface Column {
  key: string;
  label: string;
  sort?: SortColumn;
}

/**
 * The folder list. A real <table> on wide screens; the same markup is laid out as cards
 * when the list area is narrow (container query), so there is one component, not two.
 */
@Component({
  selector: 'app-folder-table',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './folder-table.html',
  styleUrl: './folder-table.css',
})
export class FolderTable {
  protected readonly store = inject(FolderListStore);
  protected readonly query = inject(FolderQuery);
  private readonly api = inject(FoldersApi);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  readonly openId = input<number | null>(null);

  protected readonly columns: Column[] = [
    { key: 'name', label: 'Υπόθεση', sort: 'FolderName' },
    { key: 'status', label: 'Κατάσταση' },
    { key: 'assignee', label: 'Χειριστής' },
    { key: 'owner', label: 'Κάτοχος', sort: 'OwnerGroupDisplayName' },
    { key: 'creator', label: 'Καταχωριστής', sort: 'CreatedByName' },
    { key: 'energia', label: 'Τελ. ενέργεια' },
    { key: 'updated', label: 'Ενημέρωση', sort: 'UpdatedDate' },
  ];

  protected readonly allSelected = computed(() => {
    const rows = this.store.rows();
    return rows.length > 0 && rows.every((r) => this.store.selection().has(r.IdFolder));
  });
  protected readonly someSelected = computed(() => !this.allSelected() && this.store.selection().size > 0);

  protected readonly dash = dash;
  protected readonly formatDate = formatDate;
  protected readonly statusKind = statusKind;
  protected readonly skeletonRows = Array.from({ length: 8 }, (_, i) => i);

  protected ariaSort(col: Column): string | null {
    if (!col.sort) return null;
    const s = this.query.state().sort;
    return s.column === col.sort ? (s.dir === 'asc' ? 'ascending' : 'descending') : 'none';
  }

  private prefetchTimer: ReturnType<typeof setTimeout> | undefined;

  /** Hover or focus on a row for a moment loads the folder, so opening it is instant. */
  protected warm(row: FolderListItem): void {
    clearTimeout(this.prefetchTimer);
    this.prefetchTimer = setTimeout(() => this.api.prefetchFolder(row.IdFolder), 120);
  }

  protected cool(): void {
    clearTimeout(this.prefetchTimer);
  }

  /** Arrow keys move between rows, Enter opens (the row's link handles Enter natively). */
  protected onKey(event: KeyboardEvent, index: number): void {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const links = this.host.querySelectorAll<HTMLAnchorElement>('a.row-link');
    const next = links[index + (event.key === 'ArrowDown' ? 1 : -1)];
    next?.focus();
  }

  /** Clicking anywhere on the row opens it, without breaking text selection or the link itself. */
  protected rowClick(event: MouseEvent, row: FolderListItem): void {
    const target = event.target as HTMLElement;
    if (target.closest('a, button, input, label') || window.getSelection()?.toString()) return;
    this.store.open(row.IdFolder);
  }
}
