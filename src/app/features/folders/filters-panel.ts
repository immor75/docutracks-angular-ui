import { ChangeDetectionStrategy, Component, ElementRef, inject, linkedSignal, viewChild } from '@angular/core';
import { Icon } from '../../ui/icon';
import { FolderQuery, STATUSES } from './folder-query';

interface Draft {
  statuses: number[];
  from: string | null;
  to: string | null;
  shared: boolean;
  unassigned: boolean;
  unread: boolean;
}

/**
 * Filters in a native popover (no overlay library). The form edits a draft; the URL changes
 * once, on "Εφαρμογή", so choosing three statuses costs one request, not three.
 */
@Component({
  selector: 'app-filters-panel',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div #panel id="filters-panel" popover class="panel" role="dialog" aria-labelledby="filters-title" (toggle)="onToggle($event)">
      <form (submit)="apply($event)">
        <header>
          <h2 id="filters-title">Φίλτρα</h2>
          <button type="button" class="btn btn--ghost btn--icon" (click)="close()" aria-label="Κλείσιμο φίλτρων">
            <app-icon name="close" />
          </button>
        </header>

        <fieldset>
          <legend>Κατάσταση</legend>
          @for (s of statuses; track s.id) {
            <label class="check">
              <input type="checkbox" [checked]="draft().statuses.includes(s.id)" (change)="toggleStatus(s.id)" />
              {{ s.label }}
            </label>
          }
        </fieldset>

        <fieldset>
          <legend>Ημερομηνία δημιουργίας</legend>
          <div class="dates">
            <label class="field">
              <span>Από</span>
              <input class="input" type="date" [value]="draft().from ?? ''" [max]="draft().to ?? ''" (change)="setDate('from', $event)" />
            </label>
            <label class="field">
              <span>Έως</span>
              <input class="input" type="date" [value]="draft().to ?? ''" [min]="draft().from ?? ''" (change)="setDate('to', $event)" />
            </label>
          </div>
        </fieldset>

        <fieldset>
          <legend>Άλλα</legend>
          <label class="check">
            <input type="checkbox" [checked]="draft().unread" (change)="set('unread', $event)" />
            Μόνο αδιάβαστες
          </label>
          <label class="check">
            <input type="checkbox" [checked]="draft().shared" (change)="set('shared', $event)" />
            Μόνο κοινής χρήσης
          </label>
          <label class="check">
            <input type="checkbox" [checked]="draft().unassigned" (change)="set('unassigned', $event)" />
            Χωρίς χειριστή
          </label>
        </fieldset>

        <footer>
          <button type="button" class="btn btn--ghost" (click)="reset()">Καθαρισμός</button>
          <button type="submit" class="btn btn--primary">Εφαρμογή</button>
        </footer>
      </form>
    </div>
  `,
  styles: `
    .panel {
      position: fixed; inset: var(--header-h) 0 0 auto; margin: 0; width: min(360px, 100vw); height: auto;
      border: 0; border-left: 1px solid var(--shade-3); padding: 0; background: var(--white); box-shadow: var(--shadow-2);
    }
    .panel::backdrop { background: rgba(0, 0, 0, 0.12); }
    form { display: flex; flex-direction: column; height: 100%; }
    header { display: flex; align-items: center; justify-content: space-between; padding: var(--s-3) var(--s-3) var(--s-2) var(--s-5); }
    h2 { margin: 0; font-size: var(--fs-h4); line-height: var(--lh-h4); font-weight: 600; }
    fieldset { border: 0; margin: 0; padding: var(--s-3) var(--s-5); display: grid; gap: var(--s-2); border-top: 1px solid var(--shade-2); }
    legend { padding: var(--s-3) 0 var(--s-1); font-size: var(--fs-small); font-weight: 600; float: left; width: 100%; }
    .dates { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-3); }
    footer { margin-top: auto; display: flex; justify-content: flex-end; gap: var(--s-2); padding: var(--s-4) var(--s-5); border-top: 1px solid var(--shade-3); }
  `,
})
export class FiltersPanel {
  private readonly query = inject(FolderQuery);
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');
  protected readonly statuses = STATUSES;

  protected readonly draft = linkedSignal<Draft>(() => {
    const s = this.query.state();
    return { statuses: s.statuses, from: s.from, to: s.to, shared: s.shared, unassigned: s.unassigned, unread: s.unread };
  });

  /** Re-read the URL each time the panel opens, dropping unapplied edits. */
  protected onToggle(event: Event): void {
    if ((event as ToggleEvent).newState === 'open') {
      const s = this.query.state();
      this.draft.set({ statuses: s.statuses, from: s.from, to: s.to, shared: s.shared, unassigned: s.unassigned, unread: s.unread });
    }
  }

  protected toggleStatus(id: number): void {
    this.draft.update((d) => ({
      ...d,
      statuses: d.statuses.includes(id) ? d.statuses.filter((x) => x !== id) : [...d.statuses, id],
    }));
  }

  protected setDate(key: 'from' | 'to', event: Event): void {
    const value = (event.target as HTMLInputElement).value || null;
    this.draft.update((d) => ({ ...d, [key]: value }));
  }

  protected set(key: 'shared' | 'unassigned' | 'unread', event: Event): void {
    const value = (event.target as HTMLInputElement).checked;
    this.draft.update((d) => ({ ...d, [key]: value }));
  }

  protected reset(): void {
    this.draft.set({ statuses: [], from: null, to: null, shared: false, unassigned: false, unread: false });
  }

  protected apply(event: Event): void {
    event.preventDefault();
    this.query.patch(this.draft());
    this.close();
  }

  protected close(): void {
    this.panel().nativeElement.hidePopover();
  }
}
