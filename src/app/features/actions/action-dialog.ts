import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  linkedSignal,
  untracked,
  viewChild,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Observable, map, tap } from 'rxjs';
import { ActionsApi, emptyParams } from '../../core/actions-api';
import { FoldersApi } from '../../core/folders-api';
import { errorMessage } from '../../core/http';
import { FolderModule } from '../../core/models';
import { Icon } from '../../ui/icon';
import { personName } from '../folders/format';
import { ActionRunner, ActionTarget } from './action-runner';
import { OrgPicker, PickItem, PickMode, flatUsers, flattenTree, groupKey, userKey } from './org-picker';

/** Kinds that need the full folder (current assignees, shares, type, documents). */
const NEEDS_FOLDER = new Set(['assign', 'share', 'changeType', 'print', 'confirm']);

/**
 * One dialog for every write action, on the native <dialog> element: focus trap,
 * Esc and the backdrop come from the browser, so there is no overlay library.
 */
@Component({
  selector: 'app-action-dialog',
  imports: [Icon, OrgPicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './action-dialog.html',
  styleUrl: './action-dialog.css',
  // A click on the backdrop lands on the <dialog> itself; keyboard users have Esc.
  host: { '(click)': 'backdropClick($event)' },
})
export class ActionDialog {
  protected readonly runner = inject(ActionRunner);
  private readonly actions = inject(ActionsApi);
  private readonly folders = inject(FoldersApi);
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly errorMessage = errorMessage;
  protected readonly open = this.runner.current;
  /** Form state resets when this changes (a new action), not when a retry narrows the targets. */
  private readonly session = computed(() => this.open()?.seq ?? 0);
  protected readonly spec = computed(() => this.open()?.spec ?? null);
  protected readonly kind = computed(() => this.spec()?.kind ?? null);
  protected readonly targets = computed(() => this.open()?.targets ?? []);
  protected readonly single = computed(() => (this.targets().length === 1 ? this.targets()[0] : null));
  protected readonly title = computed(() => this.spec()?.title ?? this.open()?.name ?? '');
  protected readonly subject = computed(() => {
    const t = this.targets();
    return t.length === 1 ? `«${t[0].name}»` : `${t.length} επιλεγμένες υποθέσεις`;
  });
  protected readonly text = computed(() => {
    const t = this.spec()?.text;
    if (!t) return '';
    const n = this.targets().length;
    return n > 1 ? `Η ενέργεια θα εκτελεστεί σε ${n} υποθέσεις, μία προς μία.` : t.replace('{n}', this.subject());
  });

  protected readonly config = rxResource({
    params: () => (this.open() ? true : undefined),
    stream: () => this.actions.config(),
  });
  protected readonly maxComment = computed(() => (this.config.hasValue() ? this.config.value().maxComment : 1000));

  /** The folder, for single-folder dialogs that show or preselect its data. */
  protected readonly folder = rxResource({
    params: () => {
      const one = this.single();
      return one && NEEDS_FOLDER.has(this.kind() ?? '') ? one.id : undefined;
    },
    stream: ({ params }) => this.folders.folder(params),
  });
  private readonly f = computed<FolderModule | null>(() => (this.folder.hasValue() ? this.folder.value() : null));

  /* ---------- Form state; resets whenever another action opens ---------- */

  protected readonly comment = linkedSignal(() => {
    this.session();
    const spec = this.spec();
    const cfg = this.config.hasValue() ? this.config.value() : null;
    if (spec?.prefillLastEnergia && cfg?.archiveAutoComment) return this.f()?.FolderEnergies?.[0]?.Comments ?? '';
    return '';
  });
  protected readonly picked = linkedSignal<PickItem[]>(() => {
    this.session();
    return this.initialPicks();
  });
  protected readonly instanceId = linkedSignal<number | null>(() => {
    this.session();
    return this.f()?.FolderTypeInstanceId ?? null;
  });
  protected readonly docIds = linkedSignal<Set<number>>(() => {
    this.session();
    return new Set(this.documents().map((d) => d.copyId));
  });
  protected readonly error = linkedSignal<string | null>(() => {
    this.session();
    return null;
  });

  /* ---------- Picker data ---------- */

  protected readonly pickMode = computed<PickMode>(() => {
    const k = this.kind();
    if (k === 'assign') return 'users';
    if (k === 'send') return 'groups';
    return this.config.hasValue() && this.config.value().shareToUsers ? 'both' : 'groups';
  });

  /**
   * Assign: users of the folder's owning group when it has one (FolderUI: get-organization-tree
   * with the owner id), else the users-to-assign list. Send and share: the whole organisation.
   */
  protected readonly pickSource = rxResource({
    params: () => {
      const k = this.kind();
      if (k !== 'assign' && k !== 'send' && k !== 'share') return undefined;
      if (k === 'share' && !this.config.hasValue()) return undefined;
      if (k === 'assign' && this.single() && !this.folder.hasValue() && !this.folder.error()) return undefined;
      const owner = k === 'assign' ? (this.f()?.OrgGroupOwnerId ?? 1) : 1;
      return { k, owner, mode: this.pickMode() };
    },
    stream: ({ params }): Observable<PickItem[]> => {
      if (params.k === 'assign' && params.owner === 1) return this.actions.usersToAssign().pipe(map(flatUsers));
      return this.actions.orgTree([params.owner]).pipe(map((tree) => flattenTree(tree, params.mode)));
    },
  });
  protected readonly pickItems = computed(() => (this.pickSource.hasValue() ? this.pickSource.value() : []));

  /** Send: only groups with Owner/Editor permission on the folder type. */
  protected readonly sendTargets = rxResource({
    params: () => {
      if (this.kind() !== 'send') return undefined;
      return this.f()?.FolderTypeInstanceId ?? this.open()?.instanceId ?? undefined;
    },
    stream: ({ params }) => this.actions.sendTargets(params),
  });
  protected readonly allowedGroups = computed<ReadonlySet<number> | null>(() => {
    if (this.kind() !== 'send' || !this.sendTargets.hasValue()) return null;
    const ids = this.sendTargets.value().map((p) => p.GroupId);
    return ids.length ? new Set(ids) : null;
  });

  protected readonly typeOptions = rxResource({
    params: () => (this.kind() === 'changeType' ? this.f()?.FolderTypeFolderStatus?.IdFolderType : undefined),
    stream: ({ params }) => this.actions.availableInstances(params),
  });

  protected readonly documents = computed(() =>
    (this.f()?.FolderDocuments ?? [])
      .filter((d) => !d.IsWithdrawn && d.Document?.IdDocumentCopy)
      .map((d) => ({
        copyId: d.Document!.IdDocumentCopy!,
        title: d.Document?.Document?.Title || '(χωρίς θέμα)',
        kind: d.DocumentKind?.Title ?? '',
        date: d.CreationDateString ?? '',
      })),
  );

  /* ---------- Validation and submit ---------- */

  protected readonly busy = computed(() => this.runner.running());

  protected readonly loadingForm = computed(() => {
    const k = this.kind();
    if (this.single() && NEEDS_FOLDER.has(k ?? '') && this.folder.isLoading()) return true;
    if (k === 'changeType') return this.typeOptions.isLoading();
    return false;
  });

  protected readonly invalid = computed(() => {
    const spec = this.spec();
    if (!spec || this.loadingForm()) return true;
    if (spec.comment === 'required' && !this.comment().trim()) return true;
    if (this.comment().length > this.maxComment()) return true;
    switch (spec.kind) {
      case 'assign':
        return !this.picked().length;
      case 'send':
        return this.picked().length !== 1;
      case 'share':
        return this.pickSource.isLoading();
      case 'changeType':
        return !this.instanceId() || this.instanceId() === this.f()?.FolderTypeInstanceId;
      case 'print':
        return !this.docIds().size;
      default:
        return false;
    }
  });

  constructor() {
    effect(() => {
      const el = this.dialog()?.nativeElement;
      if (!el) return;
      const isOpen = !!this.open();
      untracked(() => {
        if (isOpen && !el.open) el.showModal();
        else if (!isOpen && el.open) el.close();
      });
    });
  }

  protected backdropClick(event: MouseEvent): void {
    if (event.target === this.dialog()?.nativeElement) this.cancel();
  }

  protected cancel(event?: Event): void {
    event?.preventDefault();
    if (this.busy()) return;
    this.runner.close();
  }

  protected toggleDoc(id: number): void {
    this.docIds.update((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  protected toggleAllDocs(): void {
    const all = this.documents();
    this.docIds.set(this.docIds().size === all.length ? new Set() : new Set(all.map((d) => d.copyId)));
  }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    const open = this.open();
    if (!open || this.invalid() || this.busy()) return;
    this.error.set(null);
    const call = this.buildCall(open.code);
    const ok = await this.runner.run(call);
    if (!ok) {
      const p = this.runner.progress();
      const failed = p?.failed ?? [];
      this.error.set(
        p?.total === 1
          ? failed[0]?.message ?? 'Η ενέργεια απέτυχε.'
          : `Απέτυχε για ${failed.length} από ${p?.total}: ` +
              failed.map((f) => `${f.target.name} (${f.message})`).join('; ') +
              (failed.length < (p?.total ?? 0) ? '. Η επανάληψη θα αφορά μόνο αυτές.' : ''),
      );
    }
  }

  /** Request bodies follow FolderUI's dialogs one to one. */
  private buildCall(code: string): (t: ActionTarget) => Observable<unknown> {
    const spec = this.spec()!;
    const comment = this.comment().trim();
    const picks = this.picked();
    switch (spec.kind) {
      case 'assign': {
        const ids = [...new Set(picks.map((p) => p.id))];
        return (t) =>
          this.actions.run('assign', this.actions.body(t.id, code, { ActionParams: emptyParams(), AssigneesIds: ids }));
      }
      case 'send': {
        const target = picks[0]?.id ?? 0;
        return (t) => this.actions.run('action', this.actions.body(t.id, code, { ActionParams: emptyParams(comment, target) }));
      }
      case 'share': {
        const groups = picks.filter((p) => p.type === 'group').map((p) => p.id).join(',');
        const users = picks.filter((p) => p.type === 'user').map((p) => `${p.id}-${p.groupId}`).join(', ');
        return (t) => this.actions.run('share', this.actions.body(t.id, code, { GroupIds: groups, UsersGroupsIds: users }));
      }
      case 'changeType': {
        const inst = this.instanceId()!;
        return (t) =>
          this.actions.run(
            'changeType',
            this.actions.body(t.id, code, { ActionParams: emptyParams(comment), FolderTypeInstanceId: inst }),
          );
      }
      case 'print': {
        const ids = [...this.docIds()];
        return (t) =>
          this.actions
            .massivePrint(this.actions.body(t.id, code, { ActionParams: emptyParams(), DocumentCopyIds: ids }))
            .pipe(tap((blob) => download(blob, `υπόθεση-${t.id}.pdf`)));
      }
      default:
        return (t) => this.actions.run('action', this.actions.body(t.id, code, { ActionParams: emptyParams(comment) }));
    }
  }

  /** Current assignees / shares, so the dialog edits the existing state like FolderUI. */
  private initialPicks(): PickItem[] {
    const f = this.f();
    const k = this.kind();
    if (!f || !this.single()) return [];
    const base = { path: '', depth: 0, parent: null, hasChildren: false, norm: '' };
    if (k === 'assign') {
      return (f.Asignees ?? [])
        .filter((a) => a.User?.Id)
        .map((a) => ({
          ...base, key: userKey('users', a.User!.Id!, null), type: 'user' as const, id: a.User!.Id!, groupId: null,
          name: personName(a.User),
        }));
    }
    if (k === 'share') {
      const mode = this.pickMode();
      return [
        ...(f.SharedWithGroups ?? [])
          .filter((g) => g.Group?.Id)
          .map((g) => ({
            ...base, key: groupKey(g.Group!.Id), type: 'group' as const, id: g.Group!.Id, groupId: g.Group!.Id,
            name: g.Group!.GroupName ?? String(g.Group!.Id),
          })),
        ...(mode === 'both' ? (f.SharedWithUsers ?? []) : [])
          .filter((u) => u.User?.Id)
          .map((u) => ({
            ...base, key: userKey('both', u.User!.Id!, u.Group?.Id ?? null), type: 'user' as const, id: u.User!.Id!,
            groupId: u.Group?.Id ?? null, name: personName(u.User),
          })),
      ];
    }
    return [];
  }
}

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
