import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { errorMessage } from '../../../core/http';
import { Icon } from '../../../ui/icon';
import { Sheet } from '../../../ui/sheet';
import { Toasts } from '../../../ui/toasts';
import { formatDate } from '../../../shared/format';
import { EditorApi } from '../editor-api';
import { DocumentForRelation, DocumentKind, FolderDocument, FolderFile } from '../editor-models';
import { EditorStore } from '../editor-store';
import { SearchPick } from '../search-pick';

const MAX_BYTES = 10 * 1024 * 1024;
/** Same list as FolderUI's validateFile. */
const ALLOWED = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'csv', 'jpg', 'jpeg', 'png'];

/** Έγγραφα (συσχέτιση εγγράφων ΣΗΔΕ, ετικέτες) και αρχεία υπόθεσης (folder-documents του FolderUI). */
@Component({
  selector: 'app-documents-tab',
  imports: [Icon, Sheet, SearchPick],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './documents-tab.html',
  styleUrl: './tabs.css',
})
export class DocumentsTab {
  protected readonly store = inject(EditorStore);
  private readonly api = inject(EditorApi);
  private readonly toasts = inject(Toasts);
  protected readonly formatDate = formatDate;
  protected readonly accept = ALLOWED.map((e) => '.' + e).join(',');

  protected readonly d = computed(() => this.store.draft()!);

  /** Kinds as a flat list: parents first, then their children, each once. */
  protected readonly kinds = computed(() => {
    const out: { id: number; title: string }[] = [];
    const seen = new Set<number>();
    const walk = (k: DocumentKind, depth: number) => {
      if (seen.has(k.IdFolderTypeDocumentKind) || k.IsActive === false) return;
      seen.add(k.IdFolderTypeDocumentKind);
      out.push({ id: k.IdFolderTypeDocumentKind, title: (depth ? '— ' : '') + k.Title });
      for (const c of k.Children ?? []) walk(c, depth + 1);
    };
    for (const k of (this.store.cfg().DocumentKinds ?? []).filter((x) => !x.ParentIdFolderTypeDocumentKind)) walk(k, 0);
    for (const k of this.store.cfg().DocumentKinds ?? []) walk(k, 1);
    return out;
  });

  protected readonly docGroups = computed(() => {
    const groups = new Map<string, FolderDocument[]>();
    for (const doc of this.d().FolderDocuments) {
      const title = doc.DocumentKind?.Title || 'Χωρίς κατηγορία';
      groups.set(title, [...(groups.get(title) ?? []), doc]);
    }
    return [...groups.entries()].map(([title, docs]) => ({ title, docs }));
  });

  protected docTitle(doc: FolderDocument): string {
    return doc.Document?.Document?.Title || '(χωρίς θέμα)';
  }

  protected removeDoc(doc: FolderDocument): void {
    this.store.list('FolderDocuments', (l) => l.filter((x) => x !== doc));
  }

  protected tags(doc: FolderDocument) {
    return (doc.FolderDocumentTags ?? []).filter((t) => !t.IsWithdrawn);
  }

  protected addTag(doc: FolderDocument, input: HTMLInputElement): void {
    const name = input.value.trim();
    if (!name) return;
    input.value = '';
    if (this.tags(doc).some((t) => t.Name.toLocaleLowerCase('el') === name.toLocaleLowerCase('el'))) return;
    const tag = { IdFolderDocumentTag: 0, IdFolderDocument: doc.IdFolderDocument, IdTag: 0, Name: name, IsWithdrawn: false };
    this.store.list('FolderDocuments', (l) =>
      l.map((x) => (x === doc ? { ...x, FolderDocumentTags: [...(x.FolderDocumentTags ?? []), tag] } : x)),
    );
  }

  /** Saved tags are withdrawn (kept with IsWithdrawn), new ones are dropped. */
  protected removeTag(doc: FolderDocument, name: string): void {
    this.store.list('FolderDocuments', (l) =>
      l.map((x) =>
        x !== doc
          ? x
          : {
              ...x,
              FolderDocumentTags: (x.FolderDocumentTags ?? [])
                .filter((t) => t.IdFolderDocumentTag || t.Name !== name)
                .map((t) => (t.Name === name ? { ...t, IsWithdrawn: true } : t)),
            },
      ),
    );
  }

  /* ---------- Προσθήκη εγγράφων ---------- */

  protected readonly addingDocs = signal(false);
  protected readonly pickedDocs = signal<DocumentForRelation[]>([]);
  protected readonly docKind = signal<number | null>(null);
  protected readonly searchDocs = (term: string, page: number) => this.api.documents(term, page);
  protected readonly docKey = (d: DocumentForRelation) => d.IdDocumentCopy;
  protected readonly docRowTitle = (d: DocumentForRelation) => d.Title || '(χωρίς θέμα)';
  protected readonly docRowMeta = (d: DocumentForRelation) =>
    [d.ProtocolText, formatDate(d.IssueDate), d.CreatedBy].filter((x) => x && x !== '—').join(' · ');

  protected openDocs(): void {
    this.pickedDocs.set([]);
    this.docKind.set(this.kinds()[0]?.id ?? null);
    this.addingDocs.set(true);
  }

  protected confirmDocs(): void {
    const d = this.d();
    const have = new Set(d.FolderDocuments.map((x) => x.Document?.IdDocumentCopy));
    const kindId = this.docKind();
    const kind = kindId ? { IdFolderTypeDocumentKind: kindId, Title: this.kinds().find((k) => k.id === kindId)?.title.replace(/^— /, '') } : null;
    const added: FolderDocument[] = this.pickedDocs()
      .filter((p) => !have.has(p.IdDocumentCopy))
      .map((p) => ({
        IdFolderDocument: 0,
        IdFolder: d.IdFolder,
        Comments: '',
        DocumentKind: kind,
        FolderDocumentTags: [],
        Document: {
          IdDocumentCopy: p.IdDocumentCopy,
          Document: { IdDocument: p.Id, Title: p.Title, ProtocolText: p.ProtocolText, IssueDate: p.IssueDate, IdDocumentType: p.DocumentType },
        },
      }));
    this.store.list('FolderDocuments', (l) => [...l, ...added]);
    this.addingDocs.set(false);
  }

  /* ---------- Αρχεία ---------- */

  protected readonly fileKinds = computed(() => this.store.cfg().FolderFileKinds ?? []);
  protected readonly fileKind = signal<number | null>(null);
  protected readonly fileErrors = signal<string[]>([]);

  protected fileSize(f: FolderFile): string {
    const b = f._size;
    if (!b) return '';
    return b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;
  }

  protected async onFiles(input: HTMLInputElement): Promise<void> {
    const files = Array.from(input.files ?? []);
    input.value = '';
    const errors: string[] = [];
    const ok: File[] = [];
    for (const f of files) {
      const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
      if (!ALLOWED.includes(ext)) errors.push(`${f.name}: δεν επιτρέπεται αυτός ο τύπος αρχείου.`);
      else if (f.size > MAX_BYTES) errors.push(`${f.name}: ξεπερνά τα 10 MB.`);
      else ok.push(f);
    }
    this.fileErrors.set(errors);
    const kindId = this.fileKind();
    const kind = this.fileKinds().find((k) => k.FolderFileKind.Id === kindId)?.FolderFileKind;
    const added = await Promise.all(
      ok.map(async (f) => ({
        IdFolderFile: 0,
        FileName: f.name,
        IdFolder: this.d().IdFolder,
        Base64File: await toBase64(f),
        IsEncrypted: false,
        _size: f.size,
        ...(kind ? { FolderFileKind: { Id: kind.Id, Title: kind.Title } } : {}),
      })),
    );
    if (added.length) this.store.list('FolderFiles', (l) => [...l, ...added]);
  }

  protected removeFile(f: FolderFile): void {
    this.store.list('FolderFiles', (l) => l.filter((x) => x !== f));
  }

  protected async download(f: FolderFile): Promise<void> {
    if (!f.IdFolderFile) return;
    try {
      const blob = await firstValueFrom(this.api.file(this.d().IdFolder, f.IdFolderFile));
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = f.FileName ?? `file-${f.IdFolderFile}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      this.toasts.error(`Το αρχείο δεν κατέβηκε. ${errorMessage(e)}`);
    }
  }
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}
