import { ChangeDetectionStrategy, Component, inject, input, linkedSignal, output, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { RegFilesField, UploadedFile } from '../../../core/documents-models';
import { errorMessage } from '../../../core/http';
import { RegisterApi } from '../../../core/register-api';
import { Session } from '../../../core/session';
import { fileSize } from '../../../shared/format';
import { Icon } from '../../../ui/icon';

interface Pending {
  id: number;
  name: string;
  error: string | null;
}

let seq = 0;

/**
 * Κύριο αρχείο, Συνημμένα: pick or drop files; each one goes to the temporary store at once
 * (`POST files`), so registration only sends their ids. A native file input under a styled
 * label: keyboard and screen readers get the browser's own control.
 */
@Component({
  selector: 'app-files-field',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (list().length || pending().length) {
      <ul class="list">
        @for (f of list(); track f.TempId ?? 'f' + f.FileId) {
          <li>
            <app-icon [name]="f.IsPdf ? 'file' : 'attachment'" [size]="18" />
            <span class="name">{{ f.Name }}</span>
            <span class="size">{{ fileSize(f.Size) }}</span>
            <button type="button" class="btn btn--ghost btn--icon" (click)="remove(f)" [attr.aria-label]="'Αφαίρεση ' + f.Name">
              <app-icon name="close" [size]="16" />
            </button>
          </li>
        }
        @for (p of pending(); track p.id) {
          <li [class.err]="p.error">
            @if (p.error) {
              <app-icon name="alert" [size]="18" />
              <span class="name">{{ p.name }}: {{ p.error }}</span>
              <button type="button" class="btn btn--ghost btn--icon" (click)="dismiss(p)" [attr.aria-label]="'Κλείσιμο μηνύματος για ' + p.name">
                <app-icon name="close" [size]="16" />
              </button>
            } @else {
              <span class="spinner" aria-hidden="true"></span>
              <span class="name">{{ p.name }}</span>
              <span class="size" role="status">Ανεβαίνει…</span>
            }
          </li>
        }
      </ul>
    }
    @if (field().Multi || !list().length) {
      <div class="drop" [class.over]="over()" (dragover)="dragOver($event)" (dragleave)="over.set(false)" (drop)="drop($event)">
        <input
          type="file"
          class="sr-only"
          [id]="id"
          [multiple]="field().Multi"
          [attr.accept]="field().Accept || null"
          [attr.aria-describedby]="describedBy()"
          [attr.aria-invalid]="invalid() || null"
          (change)="picked($event)"
        />
        <label [for]="id" class="btn">
          <app-icon name="upload" [size]="18" />
          {{ field().Multi ? 'Επιλογή αρχείων' : 'Επιλογή αρχείου' }}
        </label>
        <span class="hint">ή σύρετέ τα εδώ{{ field().MaxSizeMb ? ' · έως ' + field().MaxSizeMb + ' MB το καθένα' : '' }}</span>
      </div>
    }
  `,
  styles: `
    :host { display: grid; gap: var(--s-2); }
    .list { display: grid; gap: var(--s-1); margin: 0; padding: 0; list-style: none; }
    .list li { display: flex; align-items: center; gap: var(--s-2); padding: var(--s-1) var(--s-2); border: 1px solid var(--shade-3); border-radius: var(--r-md); font-size: var(--fs-small); }
    .list li.err { border-color: var(--notice-dark); color: var(--notice-dark); background: var(--notice-bg); }
    .name { flex: 1; min-width: 0; overflow-wrap: anywhere; }
    .size { color: var(--secondary); font-size: var(--fs-tiny); white-space: nowrap; }
    .drop {
      display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-2); padding: var(--s-3); border: 1px dashed var(--shade-4);
      border-radius: var(--r-md); background: var(--shade-1alt);
    }
    .drop.over { border-color: var(--accent); background: var(--accent-tint); }
    .drop input:focus-visible + label { box-shadow: var(--focus); }
    .drop label { cursor: pointer; }
    .hint { color: var(--secondary); font-size: var(--fs-small); }
    .spinner { width: 14px; height: 14px; border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; animation: spin 0.7s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  `,
})
export class FilesField {
  private readonly api = inject(RegisterApi);
  private readonly session = inject(Session);

  readonly field = input.required<RegFilesField>();
  readonly value = input<UploadedFile[]>([]);
  readonly invalid = input(false);
  readonly describedBy = input<string | null>(null);
  readonly valueChange = output<UploadedFile[]>();
  /** Uploads in flight, so the page can wait for them. */
  readonly busy = output<number>();

  protected readonly id = `files-${++seq}`;
  protected readonly fileSize = fileSize;
  protected readonly pending = signal<Pending[]>([]);
  protected readonly over = signal(false);
  /**
   * The list as this field last changed it: the `value` input catches up only on the next change
   * detection, so a removal followed at once by an upload must not start from the old list.
   */
  protected readonly list = linkedSignal(() => this.value());

  protected picked(event: Event): void {
    const input = event.target as HTMLInputElement;
    void this.add([...(input.files ?? [])]);
    input.value = '';
  }

  protected dragOver(event: DragEvent): void {
    event.preventDefault();
    this.over.set(true);
  }

  protected drop(event: DragEvent): void {
    event.preventDefault();
    this.over.set(false);
    void this.add([...(event.dataTransfer?.files ?? [])]);
  }

  private async add(files: File[]): Promise<void> {
    const groupId = this.session.groupId();
    if (!groupId || !files.length) return;
    const list = this.field().Multi ? files : files.slice(0, 1);
    const max = (this.field().MaxSizeMb ?? 0) * 1024 * 1024;
    await Promise.all(
      list.map(async (file) => {
        const p: Pending = { id: ++seq, name: file.name, error: null };
        if (max && file.size > max) {
          this.pending.update((l) => [...l, { ...p, error: `ξεπερνά τα ${this.field().MaxSizeMb} MB.` }]);
          return;
        }
        this.pending.update((l) => [...l, p]);
        this.busy.emit(this.inFlight());
        try {
          const up = await firstValueFrom(this.api.upload(groupId, file));
          this.pending.update((l) => l.filter((x) => x.id !== p.id));
          // The list as it is when this upload ends (others may have ended or been removed meanwhile).
          this.list.update((l) => (this.field().Multi ? [...l, up] : [up]));
          this.valueChange.emit(this.list());
        } catch (e) {
          this.pending.update((l) => l.map((x) => (x.id === p.id ? { ...x, error: errorMessage(e) } : x)));
        }
        this.busy.emit(this.inFlight());
      }),
    );
  }

  private inFlight(): number {
    return this.pending().filter((p) => !p.error).length;
  }

  protected remove(f: UploadedFile): void {
    this.list.update((l) => l.filter((x) => x !== f));
    this.valueChange.emit(this.list());
  }

  protected dismiss(p: Pending): void {
    this.pending.update((l) => l.filter((x) => x !== p));
  }
}
