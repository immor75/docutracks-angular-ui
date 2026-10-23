import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  numberAttribute,
  untracked,
  viewChild,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { FoldersApi } from '../../core/folders-api';
import { errorMessage } from '../../core/http';
import { FolderModule, UiAction } from '../../core/models';
import { Session } from '../../core/session';
import { Icon } from '../../ui/icon';
import { ActionMenu } from '../actions/action-menu';
import { EditorApi } from '../editor/editor-api';
import { ParticularItem, ParticularsView, particularItems } from './particulars-view';
import { ActionRunner } from '../actions/action-runner';
import { FolderListStore } from '../folders/folder-list.store';
import { dash, formatDate, parseDate, personName, statusKind } from '../folders/format';
import { FOLDERS } from '../../core/paths';

type TabId = 'general' | 'documents' | 'contacts' | 'history' | 'related' | 'deadlines';

interface Tab {
  id: TabId;
  label: string;
  count: number | null;
}

/** Folder view, loaded lazily as its own chunk. Opens beside the list (desktop) or full screen. */
@Component({
  selector: 'app-folder-detail',
  imports: [Icon, ActionMenu, ParticularsView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './folder-detail.html',
  styleUrl: './folder-detail.css',
  host: { '(document:keydown)': 'onKey($event)' },
})
export class FolderDetail {
  /** Route param `:id`, bound by `withComponentInputBinding()`. */
  readonly id = input.required({ transform: numberAttribute });

  private readonly api = inject(FoldersApi);
  private readonly session = inject(Session);
  private readonly router = inject(Router);
  protected readonly list = inject(FolderListStore);
  private readonly editorApi = inject(EditorApi);
  private readonly runner = inject(ActionRunner);
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');

  protected readonly dash = dash;
  protected readonly formatDate = formatDate;
  protected readonly personName = personName;
  protected readonly statusKind = statusKind;
  protected readonly errorMessage = errorMessage;

  protected readonly folder = rxResource({
    params: () => this.id(),
    stream: ({ params }) => this.api.folder(params),
  });

  protected readonly actions = rxResource({
    params: () => {
      const userId = this.session.user()?.Id;
      const groupId = this.session.groupId();
      return userId && groupId ? { userId, groupId, id: this.id() } : undefined;
    },
    stream: ({ params }) => this.api.actions(params.userId, params.groupId, params.id),
  });

  /** The list row, shown at once while the full folder loads. */
  protected readonly row = computed(() => this.list.rows().find((r) => r.IdFolder === this.id()) ?? null);
  protected readonly f = computed<FolderModule | null>(() => (this.folder.hasValue() ? this.folder.value() : null));

  protected readonly title = computed(() => this.f()?.FolderName || this.row()?.FolderName || '');
  protected readonly status = computed(
    () => this.f()?.FolderTypeFolderStatus?.Title || this.row()?.StatusString || '',
  );

  protected readonly tabs = computed<Tab[]>(() => {
    const f = this.f();
    const n = (a: unknown[] | undefined) => (f ? (a?.length ?? 0) : null);
    return [
      { id: 'general', label: 'Γενικά', count: null },
      { id: 'documents', label: 'Έγγραφα', count: n(f?.FolderDocuments) },
      { id: 'contacts', label: 'Εμπλεκόμενοι', count: n(f?.FolderContacts) },
      { id: 'history', label: 'Ιστορικό', count: n(f?.Histories) },
      { id: 'related', label: 'Συνδεδεμένες', count: f ? (f.RelationsAsParent?.length ?? 0) + (f.RelationsAsChild?.length ?? 0) : null },
      { id: 'deadlines', label: 'Προθεσμίες', count: n(f?.FolderDeadlines) },
    ];
  });

  /** Tab resets to "Γενικά" when another folder opens. */
  protected readonly tab = linkedSignal<number, TabId>({ source: this.id, computation: () => 'general' });

  protected readonly neighbours = computed(() => {
    const rows = this.list.rows();
    const i = rows.findIndex((r) => r.IdFolder === this.id());
    return { prev: i > 0 ? rows[i - 1].IdFolder : null, next: i >= 0 && i < rows.length - 1 ? rows[i + 1].IdFolder : null };
  });

  protected readonly history = computed(() =>
    [...(this.f()?.Histories ?? [])].sort(
      (a, b) => (parseDate(b.Date)?.getTime() ?? 0) - (parseDate(a.Date)?.getTime() ?? 0),
    ),
  );

  protected readonly related = computed(() => {
    const f = this.f();
    if (!f) return [];
    return [
      ...(f.RelationsAsParent ?? []).map((r) => ({
        id: r.IdFolderRelation,
        type: r.FolderRelationType?.Title ?? 'Σχετίζεται με',
        folderId: r.ChildFolder?.Id ?? r.IdChildFolder ?? null,
        name: [r.ChildCaseNumber, r.ChildFolder?.Name].filter(Boolean).join(' · '),
        date: r.RelationDate,
      })),
      ...(f.RelationsAsChild ?? []).map((r) => ({
        id: r.IdFolderRelation,
        type: r.FolderRelationType?.InverseTitle ?? r.FolderRelationType?.Title ?? 'Σχετίζεται με',
        folderId: r.ParentFolder?.Id ?? r.IdParentFolder ?? null,
        name: [r.ParentCaseNumber, r.ParentFolder?.Name].filter(Boolean).join(' · '),
        date: r.RelationDate,
      })),
    ];
  });

  /** Formio inputs of the folder's type (cached 10 min), to read «Ειδικά στοιχεία» from Metadata. */
  protected readonly typeCfg = rxResource({
    params: () => this.f()?.FolderTypeInstanceId || undefined,
    stream: ({ params }) => this.editorApi.typeExtended(params),
  });

  protected readonly particulars = computed<ParticularItem[]>(() => {
    const f = this.f();
    if (!f) return [];
    const schema = this.typeCfg.value()?.FolderTypeExtended?.FormioSchemaInputs ?? [];
    return particularItems(schema, f.Metadata);
  });

  protected runAction(action: UiAction): void {
    const name = this.title() || `Υπόθεση ${this.id()}`;
    this.runner.open(action, [{ id: this.id(), name }], this.f()?.FolderTypeInstanceId ?? null);
  }

  constructor() {
    // After a write action: reload this folder and what it can do now.
    let firstRevision = true;
    effect(() => {
      this.api.revision();
      if (firstRevision) {
        firstRevision = false;
        return;
      }
      untracked(() => {
        this.folder.reload();
        this.actions.reload();
      });
    });

    // "Ιστορικό" from the actions menu opens the history tab.
    effect(() => {
      const id = this.runner.historyFor();
      if (id === null || id !== this.id()) return;
      untracked(() => {
        this.tab.set('history');
        this.runner.historyFor.set(null);
      });
    });

    // Move focus to the heading when a folder opens, so screen readers announce it.
    effect(() => {
      this.id();
      queueMicrotask(() => this.heading()?.nativeElement.focus({ preventScroll: true }));
    });
  }

  protected go(id: number | null): void {
    if (id !== null) void this.router.navigate([FOLDERS, id], { queryParamsHandling: 'preserve' });
  }

  protected close(): void {
    void this.router.navigate([FOLDERS], { queryParamsHandling: 'preserve' });
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
    if (next < 0) return;
    event.preventDefault();
    this.tab.set(tabs[next].id);
    (event.currentTarget as HTMLElement).parentElement?.querySelectorAll<HTMLElement>('[role=tab]')[next]?.focus();
  }

  /** `j` / `k` open the next / previous folder of the list. */
  protected onKey(event: KeyboardEvent): void {
    const t = event.target as HTMLElement;
    if (t.closest('input, textarea, select, [contenteditable]') || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'j') this.go(this.neighbours().next);
    else if (event.key === 'k') this.go(this.neighbours().prev);
    else if (event.key === 'f') this.list.toggleExpanded();
  }
}
