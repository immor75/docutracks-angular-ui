import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  numberAttribute,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { DocumentsApi } from '../../core/documents-api';
import { DOCUMENT_TYPES, DocumentAction, DocumentFile, DocumentView } from '../../core/documents-models';
import { errorMessage } from '../../core/http';
import { CLASSIC, FOLDERS } from '../../core/paths';
import { Session } from '../../core/session';
import { dash, formatDate } from '../../shared/format';
import { saveBlob } from '../../shared/save-file';
import { Toasts } from '../../ui/toasts';
import { Icon } from '../../ui/icon';
import { DocActionRunner } from './actions/doc-action-runner';
import { DocumentActions } from './document-actions';
import { DocumentListStore } from './document-list.store';

type TabId = 'facts' | 'files' | 'copies' | 'related' | 'history';

interface Tab {
  id: TabId;
  label: string;
  count: number | null;
}

const ROLE_LABEL: Record<DocumentFile['Role'], string> = {
  main: 'Κύριο αρχείο',
  attachment: 'Συνημμένο',
  internal: 'Εσωτερικό συνημμένο',
  signer: 'Συνημμένο υπογράφοντα',
};

export function fileSize(bytes: number | null | undefined): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

/**
 * Document view (UIViewDoc), lazy loaded. Opens beside the list on desktop, full screen on a
 * phone. Facts, files with an inline PDF preview, copies (διακίνηση), related documents and
 * folders, history; and the actions, with the reason for those that cannot run.
 */
@Component({
  selector: 'app-document-detail',
  imports: [Icon, RouterLink, DocumentActions],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './document-detail.html',
  styleUrl: './document-detail.css',
  host: { '(document:keydown)': 'onKey($event)' },
})
export class DocumentDetail {
  /** Route param `:id`, bound by `withComponentInputBinding()`. */
  readonly id = input.required({ transform: numberAttribute });

  private readonly api = inject(DocumentsApi);
  private readonly session = inject(Session);
  private readonly sanitizer = inject(DomSanitizer);
  protected readonly list = inject(DocumentListStore);
  private readonly toasts = inject(Toasts);
  private readonly runner = inject(DocActionRunner);
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');

  protected readonly dash = dash;
  protected readonly formatDate = formatDate;
  protected readonly fileSize = fileSize;
  protected readonly errorMessage = errorMessage;
  protected readonly types = DOCUMENT_TYPES;
  protected readonly roleLabel = ROLE_LABEL;
  protected readonly FOLDERS = FOLDERS;

  /** Reloads after an action (the API bumps `revision` after every write). */
  private readonly params = computed(() => {
    const groupId = this.session.groupId();
    return groupId ? { groupId, id: this.id(), rev: this.api.revision() } : undefined;
  });

  protected readonly doc = rxResource({
    params: () => this.params(),
    stream: ({ params }) => this.api.document(params.groupId, params.id),
  });

  protected readonly actions = rxResource({
    params: () => this.params(),
    stream: ({ params }) => this.api.actions(params.groupId, params.id),
  });

  /** The list row, shown at once while the full document loads. */
  protected readonly row = computed(() => this.list.rows().find((r) => r.Id === this.id()) ?? null);
  protected readonly d = computed<DocumentView | null>(() => (this.doc.hasValue() ? this.doc.value() : null));
  protected readonly title = computed(() => this.d()?.Title ?? this.row()?.Title ?? '');
  protected readonly type = computed(() => this.d()?.Type ?? this.row()?.Type ?? null);
  protected readonly status = computed(() => this.d()?.Status ?? this.row()?.Status ?? '');
  protected readonly isFinal = computed(() => this.d()?.IsFinal ?? this.row()?.IsFinal ?? false);
  protected readonly classicHref = computed(() => CLASSIC.viewDocument(this.session.groupId(), this.id()));

  protected readonly tabs = computed<Tab[]>(() => {
    const d = this.d();
    const n = (a: unknown[] | undefined) => (d ? (a?.length ?? 0) : null);
    return [
      { id: 'facts', label: 'Στοιχεία', count: null },
      { id: 'files', label: 'Αρχεία', count: n(d?.Files) },
      { id: 'copies', label: 'Διακίνηση', count: n(d?.Copies) },
      { id: 'related', label: 'Σχετικά', count: d ? d.Related.length + d.Folders.length : null },
      { id: 'history', label: 'Ιστορικό', count: null },
    ];
  });

  /** Tab resets to «Στοιχεία» when another document opens. */
  protected readonly tab = linkedSignal<number, TabId>({ source: this.id, computation: () => 'facts' });

  /** Loaded only when the tab is opened. */
  protected readonly history = rxResource({
    params: () => (this.tab() === 'history' ? this.params() : undefined),
    stream: ({ params }) => this.api.history(params.groupId, params.id),
  });

  protected readonly neighbours = computed(() => {
    const rows = this.list.rows();
    const i = rows.findIndex((r) => r.Id === this.id());
    return { prev: i > 0 ? rows[i - 1].Id : null, next: i >= 0 && i < rows.length - 1 ? rows[i + 1].Id : null };
  });

  /* ---------- files ---------- */

  /** The file shown in the preview: the one picked, else the main file, else the first PDF. */
  protected readonly picked = linkedSignal<number, number | null>({ source: this.id, computation: () => null });
  protected readonly previewFile = computed(() => {
    const files = this.d()?.Files ?? [];
    return files.find((f) => f.Id === this.picked()) ?? files.find((f) => f.Role === 'main' && f.IsPdf) ?? files.find((f) => f.IsPdf) ?? null;
  });

  private readonly preview = rxResource({
    params: () => (this.tab() === 'files' ? this.previewFile()?.Id : undefined),
    stream: ({ params }) => this.api.file(params),
  });
  /** Object URL of the previewed PDF; revoked when it changes or the view closes. */
  private objectUrl: string | null = null;
  protected readonly previewUrl = computed<SafeResourceUrl | null>(() => {
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = null;
    if (!this.preview.hasValue()) return null;
    this.objectUrl = URL.createObjectURL(this.preview.value());
    return this.sanitizer.bypassSecurityTrustResourceUrl(this.objectUrl);
  });
  protected readonly previewLoading = computed(() => this.preview.isLoading());
  protected readonly previewError = computed(() => this.preview.error());

  /** File being downloaded, or 'all' for the ZIP. */
  protected readonly downloading = signal<number | 'all' | null>(null);

  protected download(file: DocumentFile): void {
    this.downloading.set(file.Id);
    this.api.file(file.Id).subscribe({
      next: (blob) => {
        saveBlob(blob, file.Name);
        this.downloading.set(null);
      },
      error: (e: unknown) => this.downloadFailed(e),
    });
  }

  /** Every file the user may see, in one ZIP, as «Λήψη αρχείων» of UIViewDoc. */
  protected downloadAll(): void {
    const p = this.params();
    if (!p) return;
    this.downloading.set('all');
    this.api.zip(p.groupId, p.id).subscribe({
      next: (blob) => {
        saveBlob(blob, `${(this.title() || 'Έγγραφο ' + p.id).replace(/[\\/:*?"<>|]/g, '_').slice(0, 80)}.zip`);
        this.downloading.set(null);
      },
      error: (e: unknown) => this.downloadFailed(e),
    });
  }

  private downloadFailed(e: unknown): void {
    this.downloading.set(null);
    this.toasts.error(`Η λήψη απέτυχε. ${errorMessage(e)}`);
  }

  /* ---------- marks ---------- */

  /** Σημαντικό: follows the row and the document, and changes at once when toggled here. */
  protected readonly important = linkedSignal(() => this.row()?.IsImportant ?? this.d()?.IsImportant ?? false);

  protected async toggleImportant(): Promise<void> {
    const next = !this.important();
    this.important.set(next);
    if (!(await this.list.setFlags([this.id()], { IsImportant: next }))) this.important.set(!next);
  }

  /** Back to «unread» and back to the list, as in a mail client (opening marks it read again). */
  protected async markUnread(): Promise<void> {
    const id = this.id();
    if (await this.list.setFlags([id], { IsRead: false })) {
      this.list.close();
      this.toasts.success('Το έγγραφο σημειώθηκε ως μη αναγνωσμένο.');
    }
  }

  constructor() {
    // Opening the view marks the document as read (as UiViewDoc does), once it has loaded.
    effect(() => {
      const id = this.d()?.Id;
      if (id) untracked(() => this.list.markRead(id));
    });

    // Focus the heading when a document opens, so screen readers announce it.
    effect(() => {
      this.id();
      queueMicrotask(() => this.heading()?.nativeElement.focus({ preventScroll: true }));
    });

    inject(DestroyRef).onDestroy(() => {
      if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    });
  }

  protected onLocalAction(a: DocumentAction): void {
    if (a.Code === 'UiViewHist') this.tab.set('history');
    else this.runner.open(a.Code, a.Name, [{ id: this.id(), title: this.title() }]);
  }

  protected go(id: number | null): void {
    if (id !== null) this.list.open(id);
  }

  protected selectTab(id: TabId): void {
    this.tab.set(id);
  }

  /** Left/right arrows move between tabs (WAI-ARIA tabs pattern). */
  protected tabKey(event: KeyboardEvent, index: number): void {
    const tabs = this.tabs();
    let next = -1;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    const target = tabs[next];
    if (!target) return;
    event.preventDefault();
    this.tab.set(target.id);
    (event.currentTarget as HTMLElement).parentElement?.querySelectorAll<HTMLElement>('[role=tab]')[next]?.focus();
  }

  /** `j` / `k` next / previous document, `f` widens the view, `s` σημαντικό, `u` μη αναγνωσμένο. */
  protected onKey(event: KeyboardEvent): void {
    const t = event.target as HTMLElement;
    if (event.defaultPrevented) return;
    if (t.closest('input, textarea, select, [contenteditable]') || event.ctrlKey || event.metaKey || event.altKey) return;
    if (document.querySelector('dialog[open], :popover-open')) return;
    if (event.key === 'j') this.go(this.neighbours().next);
    else if (event.key === 'k') this.go(this.neighbours().prev);
    else if (event.key === 'f') this.list.toggleExpanded();
    else if (event.key === 's') void this.toggleImportant();
    else if (event.key === 'u') void this.markUnread();
  }
}
