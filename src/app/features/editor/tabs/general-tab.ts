import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Icon } from '../../../ui/icon';
import { Sheet } from '../../../ui/sheet';
import { formatDate } from '../../../shared/format';
import { EditorApi } from '../editor-api';
import { FolderLocation, FolderRelationEdit, RelatedFolderHit, RelationType } from '../editor-models';
import { EditorStore } from '../editor-store';
import { SearchPick } from '../search-pick';

const COMMENT_MAX = 200;
type Level = 'PlacePeriferia' | 'PlaceNomos' | 'PlaceDimos' | 'PlaceKinotita';
const ID_KEY: Record<Level, string> = {
  PlacePeriferia: 'IdPeriferia',
  PlaceNomos: 'IdNomos',
  PlaceDimos: 'IdDimos',
  PlaceKinotita: 'IdKoinotita',
};
const ORDER: Level[] = ['PlacePeriferia', 'PlaceNomos', 'PlaceDimos', 'PlaceKinotita'];

/** Γενικά: τίτλος, πληροφορίες, συνδεδεμένες υποθέσεις, τοποθεσία (folder-general του FolderUI). */
@Component({
  selector: 'app-general-tab',
  imports: [Icon, Sheet, SearchPick],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './general-tab.html',
  styleUrl: './tabs.css',
})
export class GeneralTab {
  protected readonly store = inject(EditorStore);
  private readonly api = inject(EditorApi);
  protected readonly formatDate = formatDate;
  protected readonly max = COMMENT_MAX;

  protected readonly d = computed(() => this.store.draft()!);
  protected readonly nameIssue = computed(() =>
    this.store.attempted() ? this.store.issues().find((i) => i.field === 'FolderName')?.message ?? '' : '',
  );

  /* ---------- Συνδεδεμένες υποθέσεις ---------- */

  protected readonly parentTypes = computed<RelationType[]>(() => (this.store.cfg().RelationsAsParent ?? []).filter((t) => t.IsActive !== false));
  protected relationsOf(typeId: number): FolderRelationEdit[] {
    return this.d().RelationsAsParent.filter((r) => (r.FolderRelationType?.IdFolderRelationType ?? r.IdFolderRelationType) === typeId);
  }
  /** Relations where this folder is the child: shown, not editable (as in FolderUI). */
  protected readonly childRelations = computed(() =>
    this.d().RelationsAsChild.map((r) => ({
      r,
      type:
        r.FolderRelationType?.InverseTitle ||
        this.store.cfg().RelationsAsChild?.find((t) => t.IdFolderRelationType === (r.FolderRelationType?.IdFolderRelationType ?? r.IdFolderRelationType))?.InverseTitle ||
        r.FolderRelationType?.Title ||
        'Σχετίζεται με',
    })),
  );

  protected readonly relPick = signal<RelationType | null>(null);
  protected readonly relSelected = signal<RelatedFolderHit[]>([]);
  protected readonly searchFolders = (term: string, page: number) =>
    this.api.relatedFolders(this.relPick()?.IdFolderRelationType ?? 0, this.d().IdFolder, term, page);
  protected readonly folderKey = (f: RelatedFolderHit) => f.IdFolder;
  protected readonly folderTitle = (f: RelatedFolderHit) => f.FolderName || `Υπόθεση ${f.IdFolder}`;
  protected readonly folderMeta = (f: RelatedFolderHit) => [f.FolderTypeAndNumber, f.StatusString, f.OwnerGroupDisplayName].filter(Boolean).join(' · ');

  protected openRelate(t: RelationType): void {
    this.relSelected.set([]);
    this.relPick.set(t);
  }

  protected addRelations(): void {
    const t = this.relPick();
    if (!t) return;
    const d = this.d();
    const existing = new Set(this.relationsOf(t.IdFolderRelationType).map((r) => r.ChildFolder?.Id ?? r.IdChildFolder));
    const now = `/Date(${Date.now()}-0000)/`;
    const added: FolderRelationEdit[] = this.relSelected()
      .filter((f) => !existing.has(f.IdFolder))
      .map((f) => ({
        IdFolderRelation: 0,
        RelationCreator: this.store.userName(),
        RelationDate: now,
        IdParentFolder: d.IdFolder,
        IdChildFolder: f.IdFolder,
        IdFolderRelationType: t.IdFolderRelationType,
        FolderRelationType: {
          IdFolderRelationType: t.IdFolderRelationType,
          Title: t.Title,
          IdParentFolderType: t.IdParentFolderType ?? null,
          IdChildFolderType: t.IdChildFolderType ?? null,
        },
        ParentFolder: { Id: d.IdFolder, Name: d.FolderName },
        ChildFolder: { Id: f.IdFolder, Name: f.FolderName },
        ChildCaseNumber: f.FolderTypeAndNumber?.split('/').pop(),
      }));
    this.store.list('RelationsAsParent', (l) => [...l, ...added]);
    this.relPick.set(null);
  }

  protected removeRelation(r: FolderRelationEdit): void {
    this.store.list('RelationsAsParent', (l) => l.filter((x) => x !== r));
  }

  protected relName(r: FolderRelationEdit, side: 'child' | 'parent'): string {
    const f = side === 'child' ? r.ChildFolder : r.ParentFolder;
    const n = side === 'child' ? r.ChildCaseNumber : r.ParentCaseNumber;
    return [n, f?.Name].filter(Boolean).join(' · ') || `Υπόθεση ${f?.Id ?? ''}`;
  }

  /* ---------- Τοποθεσία (μία, όπως στο FolderUI) ---------- */

  protected readonly loc = computed<FolderLocation>(() => this.d().FolderLocations[0] ?? { IdFolderLocation: 0 });
  private placeName(level: Level): string | undefined {
    return this.loc()[level]?.Onomasia || undefined;
  }

  protected readonly periferies = rxResource({ stream: () => this.api.places(1) });
  protected readonly nomoi = rxResource({ params: () => this.placeName('PlacePeriferia'), stream: ({ params }) => this.api.places(2, params) });
  protected readonly dimoi = rxResource({ params: () => this.placeName('PlaceNomos'), stream: ({ params }) => this.api.places(3, params) });
  protected readonly koinotites = rxResource({ params: () => this.placeName('PlaceDimos'), stream: ({ params }) => this.api.places(4, params) });

  protected placeId(level: Level): number | null {
    const p = this.loc()[level] as Record<string, unknown> | null | undefined;
    return (p?.[ID_KEY[level]] as number) ?? (p?.['Id'] as number) ?? null;
  }

  protected setPlace(level: Level, raw: string, options: { Id: number; Onomasia: string }[]): void {
    const id = Number(raw);
    const chosen = options.find((o) => o.Id === id);
    const next: FolderLocation = { ...this.loc() };
    (next as unknown as Record<string, unknown>)[level] = chosen ? { Id: chosen.Id, [ID_KEY[level]]: chosen.Id, Onomasia: chosen.Onomasia } : null;
    // A new parent empties the levels below it.
    for (const lower of ORDER.slice(ORDER.indexOf(level) + 1)) (next as unknown as Record<string, unknown>)[lower] = null;
    this.setLoc(next);
  }

  protected setLocText(key: 'PlaceRegion' | 'Description', v: string): void {
    this.setLoc({ ...this.loc(), [key]: v });
  }

  private setLoc(next: FolderLocation): void {
    this.store.list('FolderLocations', (l) => (l.length ? [next, ...l.slice(1)] : [next]));
  }
}
