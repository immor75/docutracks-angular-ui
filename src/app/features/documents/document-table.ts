import { ChangeDetectionStrategy, Component, ElementRef, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DocumentsApi } from '../../core/documents-api';
import { DOCUMENT_TYPES, DocumentColumn, DocumentRow, DocumentTypeId } from '../../core/documents-models';
import { Session } from '../../core/session';
import { dash, formatDate } from '../../shared/format';
import { Icon, IconName } from '../../ui/icon';
import { DocumentListStore } from './document-list.store';
import { DocumentQuery } from './document-query';

const TYPE_ICON: Record<DocumentTypeId, IconName> = { 1: 'incoming', 2: 'outgoing', 3: 'draft', 4: 'attachment' };

/**
 * The document list. A real <table> with the columns the server allows for the folder and the
 * user has chosen; laid out as cards when the list area is narrow (container query).
 * A row opens the document beside the list (`/documents/<id>`), keeping the list's query.
 */
@Component({
  selector: 'app-document-table',
  imports: [Icon, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './document-table.html',
  styleUrl: './document-table.css',
})
export class DocumentTable {
  protected readonly store = inject(DocumentListStore);
  private readonly query = inject(DocumentQuery);
  private readonly session = inject(Session);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly api = inject(DocumentsApi);

  readonly openId = input<number | null>(null);

  protected readonly dash = dash;
  protected readonly formatDate = formatDate;
  protected readonly types = DOCUMENT_TYPES;
  protected readonly typeIcon = TYPE_ICON;
  protected readonly skeletonRows = Array.from({ length: 8 }, (_, i) => i);

  /** Plain-text cells. */
  protected text(row: DocumentRow, col: DocumentColumn): string | null | undefined {
    switch (col.Key) {
      case 'ArPrApostolea': return row.SenderProtocol;
      case 'Apostoleas': return row.Sender;
      case 'Recipients': return row.Recipients;
      case 'EureiasXrisisKind': return row.SubKind;
      case 'SignaturesStatus': return row.SignaturesStatus;
      case 'NextEntityToSign': return row.NextToSign;
      case 'DocumentKind': return row.Kind;
      case 'Assignees': return row.Assignees;
      case 'Folder': return row.Folders;
      case 'Endiaferomenos': return row.Endiaferomenos;
      case 'Register': return row.CreatedBy;
      default: return null;
    }
  }

  private prefetchTimer: ReturnType<typeof setTimeout> | undefined;

  /** Hover or focus on a row for a moment loads the document, so opening it is instant. */
  protected warm(row: DocumentRow): void {
    clearTimeout(this.prefetchTimer);
    const groupId = this.session.groupId();
    if (groupId) this.prefetchTimer = setTimeout(() => this.api.prefetchDocument(groupId, row.Id), 120);
  }

  protected cool(): void {
    clearTimeout(this.prefetchTimer);
  }

  protected ariaSort(col: DocumentColumn): string | null {
    if (!col.Sortable) return null;
    const s = this.store.sort();
    return s.Column === col.Key ? (s.Direction === 'asc' ? 'ascending' : 'descending') : 'none';
  }

  protected sortBy(col: DocumentColumn): void {
    this.query.toggleSort(col.Key, this.store.sort());
  }

  /**
   * On a row: arrows move between rows, Enter follows the link natively, `x` selects the row
   * and `s` toggles «σημαντικό» (as in mail clients).
   */
  protected onKey(event: KeyboardEvent, index: number, row: DocumentRow): void {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'x' || event.key === 's') {
      event.preventDefault(); // the open view listens for `s` too
      if (event.key === 'x') this.store.toggleSelected(row.Id);
      else this.toggleImportant(row);
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const links = this.host.querySelectorAll<HTMLAnchorElement>('a.row-link');
    links[index + (event.key === 'ArrowDown' ? 1 : -1)]?.focus();
  }

  protected toggleImportant(row: DocumentRow): void {
    void this.store.setFlags([row.Id], { IsImportant: !row.IsImportant });
  }

  protected selectPage(event: Event): void {
    this.store.selectPage((event.target as HTMLInputElement).checked);
  }

  /** Clicking anywhere on the row opens it, without breaking text selection or the link itself. */
  protected rowClick(event: MouseEvent, row: DocumentRow): void {
    const target = event.target as HTMLElement;
    if (target.closest('a, button, input, label') || window.getSelection()?.toString()) return;
    this.store.open(row.Id);
  }
}
