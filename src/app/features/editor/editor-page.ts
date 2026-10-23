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
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { FoldersApi } from '../../core/folders-api';
import { errorMessage } from '../../core/http';
import { Session } from '../../core/session';
import { Icon } from '../../ui/icon';
import { Sheet } from '../../ui/sheet';
import { Toasts } from '../../ui/toasts';
import { EditorStore, EditorTab } from './editor-store';
import { ContactsTab } from './tabs/contacts-tab';
import { DocumentsTab } from './tabs/documents-tab';
import { GeneralTab } from './tabs/general-tab';
import { AppealsTab, DeadlinesTab, EnergiesTab, ParticularsTab } from './tabs/more-tabs';
import { FOLDERS } from '../../core/paths';

/**
 * Καταχώριση και επεξεργασία υπόθεσης, full page and lazy loaded.
 * Routes: `/folders/new?inst=<instance>` and `/folders/<id>/edit`. The list's query travels in `back`, so
 * "Ακύρωση" and "Αποθήκευση" return to the same list, page and filters.
 */
@Component({
  selector: 'app-editor-page',
  imports: [Icon, Sheet, GeneralTab, ContactsTab, DocumentsTab, ParticularsTab, AppealsTab, DeadlinesTab, EnergiesTab],
  providers: [EditorStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './editor-page.html',
  styleUrl: './editor-page.css',
  host: { '(window:beforeunload)': 'onUnload($event)', '(document:keydown)': 'onKey($event)' },
})
export class EditorPage {
  /** Route inputs (withComponentInputBinding). */
  readonly id = input(undefined, { transform: (v: unknown) => (v === undefined ? undefined : numberAttribute(v)) });
  readonly inst = input(undefined, { transform: (v: unknown) => (v === undefined || v === '' ? undefined : numberAttribute(v)) });
  readonly back = input<string | undefined>(undefined);

  protected readonly store = inject(EditorStore);
  private readonly folders = inject(FoldersApi);
  private readonly session = inject(Session);
  private readonly router = inject(Router);
  private readonly toasts = inject(Toasts);
  protected readonly errorMessage = errorMessage;
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');

  protected readonly isNew = computed(() => this.id() === undefined);

  /** Folder types the user may create in this group (new folder only). */
  protected readonly instances = rxResource({
    params: () => {
      const u = this.session.user()?.Id;
      const g = this.session.groupId();
      return this.isNew() && u && g ? { u, g } : undefined;
    },
    stream: ({ params }) => this.folders.instances(params.u, params.g),
  });
  protected readonly activeInstances = computed(() =>
    (this.instances.value() ?? []).filter((i) => i.IsActive).sort((a, b) => a.InstanceName.localeCompare(b.InstanceName, 'el')),
  );

  /** For a new folder: the type in the URL, else the one last used in this group. */
  protected readonly chosenInstance = linkedSignal<number | null>(() => {
    if (!this.isNew()) return null;
    const fromUrl = this.inst();
    if (fromUrl) return fromUrl;
    try {
      return Number(localStorage.getItem(`fn.type.${this.session.groupId() ?? 0}`)) || null;
    } catch {
      return null;
    }
  });

  protected readonly tab = signal<EditorTab>('general');
  protected readonly leaving = signal<((ok: boolean) => void) | null>(null);
  protected readonly saveError = signal<string | null>(null);

  protected readonly tabIssues = computed(() => {
    const set = new Set<EditorTab>();
    if (this.store.attempted()) for (const i of this.store.issues()) set.add(i.tab);
    return set;
  });

  protected readonly title = computed(() => {
    const d = this.store.draft();
    if (this.isNew()) return 'Νέα υπόθεση';
    return d?.FolderName ? d.FolderName : 'Επεξεργασία υπόθεσης';
  });
  protected readonly typeName = computed(() => this.store.type.value()?.InstanceName?.trim() || this.store.cfg().Title?.trim() || '');

  constructor() {
    // Route → store.
    effect(() => {
      const id = this.id();
      untracked(() => {
        if (id === undefined) {
          this.store.mode.set('new');
          this.store.folderId.set(null);
        } else {
          this.store.mode.set('edit');
          this.store.folderId.set(id);
        }
      });
    });

    // New: start (or restart) the draft when the chosen type changes.
    effect(() => {
      const inst = this.chosenInstance();
      if (!this.isNew() || !inst) return;
      untracked(() => {
        this.store.newInstanceId.set(inst);
        this.store.startNew(inst);
        this.tab.set('general');
      });
    });

    // Edit: start from the loaded folder, once.
    effect(() => {
      if (this.isNew() || !this.store.loaded.hasValue()) return;
      const folder = this.store.loaded.value();
      untracked(() => {
        if (this.store.draft()?.IdFolder !== folder.IdFolder) this.store.start(folder);
      });
    });

    // A tab that disappears (type changed) falls back to "Γενικά".
    effect(() => {
      const ids = this.store.tabs().map((t) => t.id);
      if (!ids.includes(untracked(this.tab))) this.tab.set('general');
    });

    effect(() => {
      if (this.store.ready()) queueMicrotask(() => this.heading()?.nativeElement.focus({ preventScroll: true }));
    });
  }

  protected changeType(raw: string): void {
    const id = Number(raw) || null;
    if (this.store.dirty() && !this.store.draft()?.FolderName && id) {
      this.chosenInstance.set(id);
      return;
    }
    this.chosenInstance.set(id);
  }

  protected selectTab(t: EditorTab): void {
    this.tab.set(t);
  }

  protected tabKey(event: KeyboardEvent, index: number): void {
    const tabs = this.store.tabs();
    let next = -1;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    if (next < 0) return;
    event.preventDefault();
    this.tab.set(tabs[next].id);
    (event.currentTarget as HTMLElement).parentElement?.querySelectorAll<HTMLElement>('[role=tab]')[next]?.focus();
  }

  protected goToIssue(tab: EditorTab, field?: string): void {
    this.tab.set(tab);
    if (field) setTimeout(() => document.getElementById('f-' + field)?.focus(), 0);
  }

  protected async save(): Promise<void> {
    this.saveError.set(null);
    if (this.store.issues().length) {
      this.store.attempted.set(true);
      const first = this.store.issues()[0];
      this.goToIssue(first.tab, first.field);
      return;
    }
    try {
      const res = await this.store.save();
      if (!res) return;
      this.toasts.success(this.isNew() ? `Η υπόθεση καταχωρίστηκε${res.caseNumber ? ' με αριθμό ' + res.caseNumber : ''}.` : 'Οι αλλαγές αποθηκεύτηκαν.');
      this.leave(res.folderId, true);
    } catch (e) {
      this.saveError.set(errorMessage(e));
    }
  }

  protected cancel(): void {
    this.leave(this.isNew() ? null : (this.id() ?? null), false);
  }

  /** Back to the list (keeping its query) with the folder open. */
  private leave(folderId: number | null, force: boolean): void {
    const back = this.back() ?? FOLDERS;
    const query = back.includes('?') ? back.slice(back.indexOf('?')) : '';
    const target = folderId ? `${FOLDERS}/${folderId}${query}` : back.replace(/^\/folders\/\d+(?=[?#]|$)/, FOLDERS);
    this.force = force;
    void this.router.navigateByUrl(target);
  }

  private force = false;

  /** canDeactivate: ask before dropping unsaved changes. */
  confirmLeave(): boolean | Promise<boolean> {
    if (this.force || !this.store.dirty()) return true;
    return new Promise((resolve) => this.leaving.set(resolve));
  }

  protected answerLeave(ok: boolean): void {
    this.leaving()?.(ok);
    this.leaving.set(null);
  }

  protected onUnload(event: BeforeUnloadEvent): void {
    if (this.store.dirty()) event.preventDefault();
  }

  /** Ctrl/Cmd+S saves. */
  protected onKey(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      void this.save();
    }
  }
}
