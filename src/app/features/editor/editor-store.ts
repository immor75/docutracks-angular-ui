import { Injectable, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Observable, firstValueFrom, map } from 'rxjs';
import { FoldersApi } from '../../core/folders-api';
import { Session } from '../../core/session';
import { EditorApi, SaveResult } from './editor-api';
import { FolderEdit, FolderLocation, FolderTypeExtended, FormioInput } from './editor-models';
import { FormValue, buildMetadata, defaultFor, parseMetadata } from './metadata-xml';

export type EditorTab = 'general' | 'contacts' | 'documents' | 'particulars' | 'appeals' | 'deadlines' | 'energies';

export interface ValidationIssue {
  tab: EditorTab;
  field?: string;
  message: string;
}

const COMMENT_MAX = 200;

function emptyFolder(instanceId: number): FolderEdit {
  return {
    IdFolder: 0,
    FolderName: '',
    FolderTypeInstanceId: instanceId,
    Comments: '',
    Metadata: '',
    Status: null,
    FolderContacts: [],
    FolderDocuments: [],
    FolderFiles: [],
    RelationsAsParent: [],
    RelationsAsChild: [],
    FolderLocations: [],
    FolderDeadlines: [],
    Martires: [],
    FolderEnergies: [],
  };
}

/** Arrays the server may omit; the editor always works on arrays. */
const LISTS = [
  'FolderContacts', 'FolderDocuments', 'FolderFiles', 'RelationsAsParent', 'RelationsAsChild',
  'FolderLocations', 'FolderDeadlines', 'Martires', 'FolderEnergies',
] as const;

function normalizeLoaded(raw: unknown): FolderEdit {
  const f = structuredClone(raw) as FolderEdit;
  for (const k of LISTS) if (!Array.isArray(f[k])) (f as Record<string, unknown>)[k] = [];
  f.Comments ??= '';
  f.Metadata ??= '';
  return f;
}

/** Drops empty location rows and empty place objects, as FolderUI's normalizeLocation does. */
function normalizeLocations(list: FolderLocation[]): FolderLocation[] {
  return list
    .map((l) => ({
      ...l,
      PlacePeriferia: l.PlacePeriferia?.IdPeriferia ? l.PlacePeriferia : null,
      PlaceNomos: l.PlaceNomos?.IdNomos ? l.PlaceNomos : null,
      PlaceDimos: l.PlaceDimos?.IdDimos ? l.PlaceDimos : null,
      PlaceKinotita: l.PlaceKinotita?.IdKoinotita ? l.PlaceKinotita : null,
      Description: l.Description?.trim() ? l.Description : null,
      PlaceRegion: l.PlaceRegion?.trim() ? l.PlaceRegion : null,
    }))
    .filter((l) => l.IdFolderLocation || l.PlacePeriferia || l.PlaceNomos || l.PlaceDimos || l.PlaceKinotita || l.Description || l.PlaceRegion);
}

/**
 * State of one editor screen (new or edit). The draft is a plain object updated immutably,
 * so `dirty` and validation are simple computeds and the template stays OnPush-friendly.
 */
@Injectable()
export class EditorStore {
  private readonly api = inject(EditorApi);
  private readonly folders = inject(FoldersApi);
  private readonly session = inject(Session);

  /** Set by the page from the route. */
  readonly mode = signal<'new' | 'edit'>('new');
  readonly folderId = signal<number | null>(null);
  readonly newInstanceId = signal<number | null>(null);

  readonly loaded = rxResource({
    params: () => (this.mode() === 'edit' ? this.folderId() ?? undefined : undefined),
    stream: ({ params }) => this.folders.folder(params).pipe(map(normalizeLoaded)),
  });

  readonly draft = signal<FolderEdit | null>(null);
  private original = '';
  private originalEnergies = '';

  readonly instanceId = computed(() => this.draft()?.FolderTypeInstanceId ?? this.newInstanceId());

  readonly type = rxResource({
    params: () => this.instanceId() ?? undefined,
    stream: ({ params }) => this.api.typeExtended(params),
  });
  readonly cfg = computed<FolderTypeExtended>(() => (this.type.hasValue() ? (this.type.value().FolderTypeExtended ?? {}) : {}));
  readonly formio = computed<FormioInput[]>(() => this.cfg().FormioSchemaInputs ?? []);

  readonly ready = computed(() => !!this.draft() && this.type.hasValue());
  readonly saving = signal(false);
  readonly attempted = signal(false);

  /** Tabs in the folder type's order; only the ones this editor supports. */
  readonly tabs = computed<{ id: EditorTab; label: string }[]>(() => {
    const cfg = this.cfg();
    const names = new Set((cfg.Tabs ?? []).map((t) => t.Name.toLowerCase()));
    const has = (n: string) => names.has(n) || names.size === 0;
    const out: { id: EditorTab; label: string; order: number }[] = [{ id: 'general', label: 'Γενικά', order: 0 }];
    const order = (n: string) => cfg.Tabs?.find((t) => t.Name.toLowerCase() === n)?.Order ?? 50;
    if (has('stakeholders')) out.push({ id: 'contacts', label: 'Εμπλεκόμενοι', order: order('stakeholders') });
    if (has('documents')) out.push({ id: 'documents', label: 'Έγγραφα και αρχεία', order: order('documents') });
    if (this.formio().length && (has('particulars') || names.size === 0)) out.push({ id: 'particulars', label: 'Ειδικά στοιχεία', order: order('particulars') });
    if (names.has('appeals')) out.push({ id: 'appeals', label: 'Ένδικα μέσα', order: order('appeals') });
    if (names.has('deadlines')) out.push({ id: 'deadlines', label: 'Προθεσμίες', order: order('deadlines') });
    if (names.has('actions') && (cfg.EnergiaKinds ?? []).some((k) => k.IsActive)) out.push({ id: 'energies', label: 'Ενέργειες', order: order('actions') });
    return out.sort((a, b) => a.order - b.order);
  });

  /** Ειδικά στοιχεία as an object; written back to Metadata on every change. */
  private readonly metadata = computed(() => this.draft()?.Metadata ?? null);
  readonly particulars = computed<FormValue>(() => {
    const xml = this.metadata();
    const schema = this.formio();
    if (xml === null) return {};
    const parsed = parseMetadata(xml, schema);
    // New folder: start from the defaults the folder type declares.
    if (!xml && this.mode() === 'new') {
      for (const input of schema) if (!input.ParentDataGridKey && !(input.Key in parsed)) parsed[input.Key] = defaultFor(input);
    }
    return parsed;
  });

  readonly dirty = computed(() => {
    const d = this.draft();
    return !!d && JSON.stringify(d) !== this.original;
  });

  readonly issues = computed<ValidationIssue[]>(() => {
    const d = this.draft();
    if (!d) return [];
    const out: ValidationIssue[] = [];
    const name = d.FolderName?.trim() ?? '';
    if (!name) out.push({ tab: 'general', field: 'FolderName', message: 'Συμπληρώστε τον τίτλο.' });
    else if (name.length < 3) out.push({ tab: 'general', field: 'FolderName', message: 'Ο τίτλος θέλει τουλάχιστον 3 χαρακτήρες.' });
    if ((d.Comments ?? '').length > COMMENT_MAX) out.push({ tab: 'general', field: 'Comments', message: `Οι πληροφορίες έως ${COMMENT_MAX} χαρακτήρες.` });
    for (const role of this.cfg().ContactRoles ?? []) {
      if (!role.IsActive) continue;
      const n = d.FolderContacts.filter((c) => c.IdFolderTypeContactRole === role.IdFolderTypeContactRole).length;
      if (role.MinInvolvedContactsLimit && n < role.MinInvolvedContactsLimit) {
        out.push({ tab: 'contacts', message: `Ο ρόλος «${role.ContactRole}» θέλει τουλάχιστον ${role.MinInvolvedContactsLimit} εμπλεκόμενους.` });
      }
      if (role.MaxInvolvedContactsLimit && n > role.MaxInvolvedContactsLimit) {
        out.push({ tab: 'contacts', message: `Ο ρόλος «${role.ContactRole}» δέχεται έως ${role.MaxInvolvedContactsLimit} εμπλεκόμενους.` });
      }
    }
    d.FolderDeadlines.forEach((dl, i) => {
      if (!dl.Deadline && (dl.Message || dl.SendDate || dl.UsersToNotify.length)) {
        out.push({ tab: 'deadlines', message: `Η προθεσμία ${i + 1} δεν έχει ημερομηνία.` });
      }
    });
    // Only energies added here are checked: records already on the server (older ones may lack
    // a kind or a date) must not block saving an unrelated change.
    d.FolderEnergies.forEach((e, i) => {
      if (e.IdFolderEnergia) return;
      if (!e.EnergiaKind?.IdFolderEnergiaKind) out.push({ tab: 'energies', message: `Η ενέργεια ${i + 1} δεν έχει είδος.` });
      if (!e.EnergiaDate) out.push({ tab: 'energies', message: `Η ενέργεια ${i + 1} δεν έχει ημερομηνία.` });
    });
    return out;
  });

  /** Called once the folder (edit) or the instance (new) is known. */
  start(folder: FolderEdit): void {
    this.draft.set(folder);
    this.original = JSON.stringify(folder);
    this.originalEnergies = JSON.stringify(folder.FolderEnergies);
    this.attempted.set(false);
  }

  startNew(instanceId: number): void {
    this.start(emptyFolder(instanceId));
  }

  /** Immutable update of top-level fields. */
  patch(change: Partial<FolderEdit>): void {
    this.draft.update((d) => (d ? { ...d, ...change } : d));
  }

  /** Immutable update of one list. */
  list<K extends (typeof LISTS)[number]>(key: K, fn: (items: FolderEdit[K]) => FolderEdit[K]): void {
    this.draft.update((d) => (d ? { ...d, [key]: fn(d[key]) } : d));
  }

  setParticulars(value: FormValue): void {
    this.patch({ Metadata: buildMetadata(value, this.formio()) });
  }

  userName(): string {
    return this.session.user()?.UserName ?? '';
  }

  async save(): Promise<SaveResult | null> {
    this.attempted.set(true);
    const d = this.draft();
    if (!d || this.issues().length || this.saving()) return null;
    this.saving.set(true);
    try {
      const toSend: FolderEdit = {
        ...d,
        FolderName: d.FolderName.trim(),
        FolderLocations: normalizeLocations(d.FolderLocations),
        // New folder with Formio inputs: send the defaults, as FolderUI does.
        Metadata: d.Metadata || (this.formio().length ? buildMetadata(this.particulars(), this.formio()) : ''),
      };
      const call: Observable<SaveResult> =
        this.mode() === 'new'
          ? this.api.register(toSend)
          : this.api.edit(toSend, JSON.stringify(d.FolderEnergies) !== this.originalEnergies);
      const res = await firstValueFrom(call);
      this.original = JSON.stringify(d);
      this.originalEnergies = JSON.stringify(d.FolderEnergies);
      this.folders.changed();
      return res;
    } finally {
      this.saving.set(false);
    }
  }
}
