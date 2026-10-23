import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { errorMessage } from '../../core/http';
import { Icon } from '../../ui/icon';
import { Toasts } from '../../ui/toasts';
import { DocumentListStore } from './document-list.store';

/**
 * «Εξαγωγή σε Excel», as List/RequestDocumentExport: the server prepares the file in the
 * background and sends the user a link, so the dialog says how many documents go in and
 * what happens next before anything is queued.
 */
@Component({
  selector: 'app-export-dialog',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(click)': 'onDialogClick($event)' },
  template: `
    <dialog #dlg class="dlg" aria-labelledby="export-title" (close)="busy.set(false)">
      <form method="dialog" (submit)="submit($event)">
        <h2 id="export-title" class="dlg__title">
          <app-icon name="xls" [size]="22" />
          Εξαγωγή σε Excel
        </h2>
        <p>
          @if (scope() === 'selection') {
            {{ count() === 1 ? 'Το επιλεγμένο έγγραφο' : 'Τα ' + count() + ' επιλεγμένα έγγραφα' }}.
          } @else {
            {{ count() === 1 ? '1 έγγραφο' : count() + ' έγγραφα' }} του φακέλου «{{ folder() }}», με την
            αναζήτηση, την περίοδο και τα φίλτρα που ισχύουν.
          }
        </p>
        <p class="muted">
          Το αρχείο ετοιμάζεται στον server. Όταν είναι έτοιμο, θα σας σταλεί σύνδεσμος για να το
          κατεβάσετε.
        </p>
        @if (store.canExportWithFiles()) {
          <label class="check">
            <input type="checkbox" [checked]="withFiles()" (change)="withFiles.set(!withFiles())" />
            Μαζί με τα αρχεία των εγγράφων
          </label>
        }
        @if (error(); as e) {
          <p class="error" role="alert">{{ e }}</p>
        }
        <div class="dlg__end">
          <button type="button" class="btn btn--ghost" (click)="close()">Άκυρο</button>
          <button type="submit" class="btn btn--primary" [disabled]="busy()" [attr.aria-busy]="busy()">
            {{ busy() ? 'Καταχωρίζεται…' : 'Εξαγωγή' }}
          </button>
        </div>
      </form>
    </dialog>
  `,
  styles: `
    .dlg {
      width: min(480px, calc(100vw - 32px)); padding: var(--s-5); border: 0; border-radius: var(--r-lg);
      background: var(--white); color: var(--body); box-shadow: var(--shadow-2);
    }
    .dlg::backdrop { background: rgba(0, 0, 0, 0.32); }
    .dlg__title { display: flex; align-items: center; gap: var(--s-2); margin: 0 0 var(--s-3); font-size: var(--fs-h3); line-height: var(--lh-h3); }
    .dlg__title app-icon { color: var(--accent); }
    p { margin: 0 0 var(--s-3); }
    .muted { color: var(--secondary); font-size: var(--fs-small); }
    .check { display: flex; align-items: center; gap: var(--s-2); margin-bottom: var(--s-3); }
    .check input { width: 18px; height: 18px; margin: 0; accent-color: var(--accent); }
    .error { padding: var(--s-2) var(--s-3); border-radius: var(--r-md); background: var(--notice-bg); color: var(--notice-dark); }
    .dlg__end { display: flex; justify-content: flex-end; gap: var(--s-2); margin-top: var(--s-4); }
  `,
})
export class ExportDialog {
  protected readonly store = inject(DocumentListStore);
  private readonly toasts = inject(Toasts);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  protected readonly scope = signal<'selection' | 'list'>('list');
  protected readonly withFiles = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly count = computed(() => (this.scope() === 'selection' ? this.store.selectedCount() : this.store.total()));
  protected readonly folder = computed(() => {
    const f = this.store.folder();
    return f ? f.path.join(' › ') : '';
  });

  open(scope: 'selection' | 'list'): void {
    this.scope.set(scope);
    this.withFiles.set(false);
    this.error.set(null);
    this.busy.set(false);
    this.dialog().nativeElement.showModal();
  }

  close(): void {
    this.dialog().nativeElement.close();
  }

  protected submit(event: Event): void {
    event.preventDefault();
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    this.store.exportList(this.scope(), this.withFiles()).subscribe({
      next: (r) => {
        this.close();
        this.toasts.success(
          `Η εξαγωγή ${r.Count === 1 ? '1 εγγράφου' : r.Count + ' εγγράφων'} καταχωρίστηκε. Θα σας σταλεί σύνδεσμος όταν το αρχείο είναι έτοιμο.`,
        );
      },
      error: (e: unknown) => {
        this.busy.set(false);
        this.error.set(errorMessage(e));
      },
    });
  }

  /** A click on the backdrop (the dialog element itself) closes it. */
  protected onDialogClick(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement && !this.busy()) this.close();
  }
}
