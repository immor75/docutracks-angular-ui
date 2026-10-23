import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, output } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { ActionsApi } from '../../core/actions-api';
import { errorMessage } from '../../core/http';
import { Sheet } from '../../ui/sheet';
import { OrgPicker, PickItem, PickMode, flattenTree, groupKey, userKey } from '../../shared/org-picker';

/**
 * Users or groups from the organisation tree, in a sheet. Used for deadlines (παραλήπτες),
 * appeals (μάρτυρες), energies (υπεύθυνος) and contacts (χρήστες, υπηρεσίες).
 */
@Component({
  selector: 'app-people-picker',
  imports: [Sheet, OrgPicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-sheet [open]="open()" [heading]="heading()" (closed)="closed.emit()">
      @if (open()) {
        <app-org-picker
          [items]="items()"
          [loading]="tree.isLoading()"
          [mode]="mode()"
          [multi]="multi()"
          [label]="mode() === 'groups' ? 'Υπηρεσίες' : 'Χρήστες'"
          [placeholder]="mode() === 'groups' ? 'Αναζήτηση υπηρεσίας…' : 'Αναζήτηση χρήστη…'"
          [(selected)]="selected"
        />
        @if (tree.error()) {
          <p class="err" role="alert">Το οργανόγραμμα δεν φορτώθηκε. {{ errorMessage(tree.error()) }}</p>
        }
      }
      <button sheet-footer type="button" class="btn" (click)="closed.emit()">Ακύρωση</button>
      <button sheet-footer type="button" class="btn btn--primary" [disabled]="!selected().length" (click)="confirm()">
        {{ confirmLabel() }}
      </button>
    </app-sheet>
  `,
  styles: `.err { margin: 0; color: var(--notice-dark); font-size: var(--fs-small); }`,
})
export class PeoplePicker {
  private readonly actions = inject(ActionsApi);
  protected readonly errorMessage = errorMessage;

  readonly open = input(false);
  readonly heading = input('Επιλογή');
  readonly mode = input<PickMode>('users');
  readonly multi = input(true);
  readonly confirmLabel = input('Προσθήκη');
  /** Ids already chosen, shown as selected. */
  readonly initial = input<{ id: number; name: string; groupId?: number | null }[]>([]);
  readonly picked = output<PickItem[]>();
  readonly closed = output<void>();

  protected readonly tree = rxResource({
    params: () => (this.open() ? this.mode() : undefined),
    stream: ({ params }) => this.actions.orgTree([1]).pipe(map((t) => flattenTree(t, params))),
  });
  protected readonly items = computed(() => (this.tree.hasValue() ? this.tree.value() : []));

  protected readonly selected = linkedSignal<PickItem[]>(() => {
    if (!this.open()) return [];
    const mode = this.mode();
    return this.initial().map((i) => ({
      key: mode === 'groups' ? groupKey(i.id) : userKey(mode, i.id, i.groupId ?? null),
      type: mode === 'groups' ? ('group' as const) : ('user' as const),
      id: i.id,
      groupId: i.groupId ?? null,
      name: i.name,
      path: '',
      depth: 0,
      parent: null,
      hasChildren: false,
      norm: '',
    }));
  });

  protected confirm(): void {
    this.picked.emit(this.selected());
  }
}
