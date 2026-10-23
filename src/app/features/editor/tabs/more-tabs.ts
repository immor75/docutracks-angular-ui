import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Icon } from '../../../ui/icon';
import { PickItem } from '../../../shared/org-picker';
import { personName } from '../../../shared/format';
import { FolderDeadline, FolderEnergia, FolderMartiras, OrgUserLite } from '../editor-models';
import { EditorStore } from '../editor-store';
import { FormioForm } from '../formio-form';
import { toInputDate } from '../metadata-xml';
import { PeoplePicker } from '../people-picker';

/** <input type="date"> value → UTC ISO, as FolderUI's date input (DateHelper.toUtcIsoString). */
function fromDateInput(v: string): string | null {
  if (!v) return null;
  const [y, m, d] = v.split('-').map(Number);
  return new Date(y, m - 1, d).toISOString();
}

function userFromPick(p: PickItem): OrgUserLite {
  const [first, ...rest] = p.name.split(' ');
  return { Id: p.id, DisplayName: p.name, FirstName: first ?? '', LastName: rest.join(' ') };
}

/** Ειδικά στοιχεία (Formio). */
@Component({
  selector: 'app-particulars-tab',
  imports: [FormioForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 class="block__title">Ειδικά στοιχεία</h2>
    <app-formio-form [schema]="store.formio()" [value]="store.particulars()" (valueChange)="store.setParticulars($event)" />
  `,
  styleUrl: './tabs.css',
})
export class ParticularsTab {
  protected readonly store = inject(EditorStore);
}

/** Ένδικα μέσα: διοικητικό και ποινικό σκέλος, με μάρτυρες (folder-appeals του FolderUI). */
@Component({
  selector: 'app-appeals-tab',
  imports: [Icon, PeoplePicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let f = store.draft()!;
    @for (side of sides; track side.piniko) {
      <section class="card" [attr.aria-labelledby]="'ap-' + side.piniko">
        <div class="card__head">
          <h3 [id]="'ap-' + side.piniko"><app-icon name="justice" [size]="16" /> {{ side.title }}</h3>
        </div>
        <div class="cols">
          @if (side.piniko) {
            <label class="field"><span>Ημ/νία δικασίμου</span>
              <input class="input" type="date" [value]="toInputDate(f.PinikDikasimosDate, false)" (change)="store.patch({ PinikDikasimosDate: fromDate($any($event.target).value) })" />
            </label>
            <label class="field"><span>Ημ/νία προανάκρισης</span>
              <input class="input" type="date" [value]="toInputDate(f.PinikProanakrisiDate, false)" (change)="store.patch({ PinikProanakrisiDate: fromDate($any($event.target).value) })" />
            </label>
          } @else {
            <label class="field"><span>Ημ/νία δικασίμου</span>
              <input class="input" type="date" [value]="toInputDate(f.DioikDikasimosDate, false)" (change)="store.patch({ DioikDikasimosDate: fromDate($any($event.target).value) })" />
            </label>
            <label class="field"><span>Πρόστιμο (€)</span>
              <input class="input" type="number" min="0" step="0.01" inputmode="decimal" [value]="f.DioikProstimo ?? ''" (input)="store.patch({ DioikProstimo: $any($event.target).value === '' ? null : +$any($event.target).value })" />
            </label>
          }
        </div>
        <div class="group">
          <div class="group__head">
            <h4 class="sub">Μάρτυρες</h4>
            <button type="button" class="btn btn--ghost" (click)="picking.set(side.piniko)"><app-icon name="plus" [size]="16" /> Μάρτυρες</button>
          </div>
          <ul class="chips">
            @for (m of witnesses(side.piniko); track m.IdUser) {
              <li class="chip">{{ name(m.Martiras) }}
                <button type="button" (click)="remove(m)" [attr.aria-label]="'Αφαίρεση ' + name(m.Martiras)"><app-icon name="close" [size]="12" /></button>
              </li>
            } @empty {
              <li class="muted">Κανένας μάρτυρας.</li>
            }
          </ul>
        </div>
      </section>
    }
    <app-people-picker
      [open]="picking() !== null"
      heading="Επιλογή μαρτύρων"
      [initial]="initial()"
      (picked)="add($event)"
      (closed)="picking.set(null)"
    />
  `,
  styleUrl: './tabs.css',
  styles: `.sub { margin: 0; font-size: var(--fs-small); font-weight: 600; } .card__head h3 { display: flex; gap: var(--s-2); align-items: center; }`,
})
export class AppealsTab {
  protected readonly store = inject(EditorStore);
  protected readonly toInputDate = toInputDate;
  protected readonly fromDate = fromDateInput;
  protected readonly name = (u: OrgUserLite) => personName(u) || `Χρήστης ${u.Id}`;
  protected readonly sides = [
    { piniko: false, title: 'Διοικητικό' },
    { piniko: true, title: 'Ποινικό' },
  ];
  protected readonly picking = signal<boolean | null>(null);

  protected witnesses(piniko: boolean): FolderMartiras[] {
    return this.store.draft()!.Martires.filter((m) => !!m.IsPiniko === piniko);
  }

  protected readonly initial = computed(() => {
    const p = this.picking();
    return p === null ? [] : this.witnesses(p).map((m) => ({ id: m.IdUser ?? m.Martiras.Id, name: this.name(m.Martiras) }));
  });

  /** The picker returns the whole selection for that side: replace it. */
  protected add(picks: PickItem[]): void {
    const piniko = this.picking();
    if (piniko === null) return;
    const d = this.store.draft()!;
    const keep = this.witnesses(piniko).filter((m) => picks.some((p) => p.id === (m.IdUser ?? m.Martiras.Id)));
    const keepIds = new Set(keep.map((m) => m.IdUser ?? m.Martiras.Id));
    const added: FolderMartiras[] = picks
      .filter((p) => !keepIds.has(p.id))
      .map((p) => ({ IdFolderMartiras: null, IdFolder: d.IdFolder, IdUser: p.id, IsPiniko: piniko, Martiras: userFromPick(p) }));
    this.store.list('Martires', (l) => [...l.filter((m) => !!m.IsPiniko !== piniko), ...keep, ...added]);
    this.picking.set(null);
  }

  protected remove(m: FolderMartiras): void {
    this.store.list('Martires', (l) => l.filter((x) => x !== m));
  }
}

/** Προθεσμίες με παραλήπτες ειδοποίησης (folder-deadlines του FolderUI). */
@Component({
  selector: 'app-deadlines-tab',
  imports: [Icon, PeoplePicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="block__head">
      <h2 class="block__title"><app-icon name="calendar" [size]="18" /> Προθεσμίες</h2>
      <button type="button" class="btn" (click)="addRow()"><app-icon name="plus" [size]="16" /> Προθεσμία</button>
    </div>
    @for (dl of rows(); track $index; let i = $index) {
      <section class="card" [attr.aria-label]="'Προθεσμία ' + (i + 1)">
        <div class="card__head">
          <h3>Προθεσμία {{ i + 1 }}</h3>
          <button type="button" class="btn btn--ghost btn--icon" (click)="removeRow(i)" [attr.aria-label]="'Διαγραφή προθεσμίας ' + (i + 1)"><app-icon name="trash" [size]="18" /></button>
        </div>
        <div class="cols">
          <label class="field"><span>Προθεσμία <abbr title="υποχρεωτικό">*</abbr></span>
            <input class="input" type="date" [value]="toInputDate(dl.Deadline, false)" (change)="set(i, { Deadline: fromDate($any($event.target).value) })" />
          </label>
          <label class="field"><span>Ημ/νία αποστολής ειδοποίησης</span>
            <input class="input" type="date" [value]="toInputDate(dl.SendDate, false)" (change)="set(i, { SendDate: fromDate($any($event.target).value) })" />
          </label>
        </div>
        <label class="field"><span>Μήνυμα</span>
          <textarea class="input area" rows="2" [value]="dl.Message" (input)="set(i, { Message: $any($event.target).value })"></textarea>
        </label>
        <div class="group">
          <div class="group__head">
            <h4 class="sub">Παραλήπτες</h4>
            <button type="button" class="btn btn--ghost" (click)="picking.set(i)"><app-icon name="plus" [size]="16" /> Παραλήπτες</button>
          </div>
          <ul class="chips">
            @for (u of dl.UsersToNotify; track u.Id) {
              <li class="chip">{{ name(u) }}
                <button type="button" (click)="removeUser(i, u.Id)" [attr.aria-label]="'Αφαίρεση ' + name(u)"><app-icon name="close" [size]="12" /></button>
              </li>
            } @empty {
              <li class="muted">Κανένας παραλήπτης.</li>
            }
          </ul>
        </div>
      </section>
    } @empty {
      <p class="muted">Δεν υπάρχουν προθεσμίες.</p>
    }
    <app-people-picker
      [open]="picking() !== null"
      heading="Παραλήπτες ειδοποίησης"
      [initial]="initial()"
      confirmLabel="Ορισμός"
      (picked)="setUsers($event)"
      (closed)="picking.set(null)"
    />
  `,
  styleUrl: './tabs.css',
  styles: `.sub { margin: 0; font-size: var(--fs-small); font-weight: 600; }`,
})
export class DeadlinesTab {
  protected readonly store = inject(EditorStore);
  protected readonly toInputDate = toInputDate;
  protected readonly fromDate = fromDateInput;
  protected readonly name = (u: OrgUserLite) => personName(u) || `Χρήστης ${u.Id}`;
  protected readonly rows = computed(() => this.store.draft()!.FolderDeadlines);
  protected readonly picking = signal<number | null>(null);
  protected readonly initial = computed(() => {
    const i = this.picking();
    return i === null ? [] : (this.rows()[i]?.UsersToNotify ?? []).map((u) => ({ id: u.Id, name: this.name(u) }));
  });

  protected addRow(): void {
    const d = this.store.draft()!;
    this.store.list('FolderDeadlines', (l) => [...l, { IdFolderDeadline: 0, IdFolder: d.IdFolder, Deadline: null, SendDate: null, Message: '', UsersToNotify: [] }]);
  }

  protected removeRow(i: number): void {
    this.store.list('FolderDeadlines', (l) => l.filter((_, j) => j !== i));
  }

  protected set(i: number, change: Partial<FolderDeadline>): void {
    this.store.list('FolderDeadlines', (l) => l.map((x, j) => (j === i ? { ...x, ...change } : x)));
  }

  protected setUsers(picks: PickItem[]): void {
    const i = this.picking();
    if (i === null) return;
    const current = this.rows()[i]?.UsersToNotify ?? [];
    this.set(i, { UsersToNotify: picks.map((p) => current.find((u) => u.Id === p.id) ?? userFromPick(p)) });
    this.picking.set(null);
  }

  protected removeUser(i: number, id: number): void {
    this.set(i, { UsersToNotify: (this.rows()[i]?.UsersToNotify ?? []).filter((u) => u.Id !== id) });
  }
}

/** Ενέργειες (FolderEnergies): «Καταχώριση ενεργειών» του ιστορικού στο FolderUI. */
@Component({
  selector: 'app-energies-tab',
  imports: [Icon, PeoplePicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="block__head">
      <h2 class="block__title"><app-icon name="clock" [size]="18" /> Ενέργειες</h2>
      <button type="button" class="btn" (click)="addRow()"><app-icon name="plus" [size]="16" /> Ενέργεια</button>
    </div>
    @for (e of rows(); track $index; let i = $index) {
      <section class="card" [attr.aria-label]="'Ενέργεια ' + (i + 1)">
        <div class="card__head">
          <h3>{{ kindTitle(e) || 'Νέα ενέργεια' }}</h3>
          <button type="button" class="btn btn--ghost btn--icon" (click)="removeRow(i)" [attr.aria-label]="'Διαγραφή ενέργειας ' + (i + 1)"><app-icon name="trash" [size]="18" /></button>
        </div>
        <div class="cols">
          <label class="field"><span>Είδος <abbr title="υποχρεωτικό">*</abbr></span>
            <select class="input" (change)="setKind(i, +$any($event.target).value)">
              <option value="" [selected]="!e.EnergiaKind?.IdFolderEnergiaKind">—</option>
              @for (k of kinds(); track k.IdFolderTypeEnergiaKind) {
                <option [value]="k.IdFolderTypeEnergiaKind" [selected]="k.IdFolderTypeEnergiaKind === e.EnergiaKind?.IdFolderEnergiaKind">{{ k.Title }}</option>
              }
            </select>
          </label>
          <label class="field"><span>Ημ/νία εκτέλεσης <abbr title="υποχρεωτικό">*</abbr></span>
            <input class="input" type="date" [value]="toInputDate(e.EnergiaDate, false)" (change)="setDate(i, $any($event.target).value)" />
          </label>
          <div class="field">
            <span>Υπεύθυνος</span>
            <button type="button" class="btn picker-btn" (click)="picking.set(i)">
              <app-icon name="user" [size]="16" /> {{ responsibleName(e) || 'Επιλογή…' }}
            </button>
          </div>
        </div>
        <label class="field"><span>Σχόλια</span>
          <textarea class="input area" rows="2" [value]="e.Comments" (input)="set(i, { Comments: $any($event.target).value })"></textarea>
        </label>
      </section>
    } @empty {
      <p class="muted">Δεν έχουν καταχωριστεί ενέργειες.</p>
    }
    <app-people-picker [open]="picking() !== null" heading="Υπεύθυνος ενέργειας" [multi]="false" confirmLabel="Ορισμός" (picked)="setResponsible($event)" (closed)="picking.set(null)" />
  `,
  styleUrl: './tabs.css',
  styles: `.picker-btn { justify-content: flex-start; width: 100%; }`,
})
export class EnergiesTab {
  protected readonly store = inject(EditorStore);
  protected readonly toInputDate = toInputDate;
  protected readonly rows = computed(() => this.store.draft()!.FolderEnergies);
  protected readonly kinds = computed(() => (this.store.cfg().EnergiaKinds ?? []).filter((k) => k.IsActive));
  protected readonly picking = signal<number | null>(null);

  protected kindTitle(e: FolderEnergia): string {
    return e.EnergiaKind?.Title || this.kinds().find((k) => k.IdFolderTypeEnergiaKind === e.EnergiaKind?.IdFolderEnergiaKind)?.Title || '';
  }

  protected responsibleName(e: FolderEnergia): string {
    return personName(e.ResponsibleUser ?? undefined) || (e.IdResponsibleUser ? `Χρήστης ${e.IdResponsibleUser}` : '');
  }

  protected addRow(): void {
    this.store.list('FolderEnergies', (l) => [
      ...l,
      { IdFolderEnergia: 0, EnergiaDate: `/Date(${Date.now()}-0000)/`, Comments: '', IdResponsibleUser: null, EnergiaKind: {} },
    ]);
  }

  protected removeRow(i: number): void {
    this.store.list('FolderEnergies', (l) => l.filter((_, j) => j !== i));
  }

  protected set(i: number, change: Partial<FolderEnergia>): void {
    this.store.list('FolderEnergies', (l) => l.map((x, j) => (j === i ? { ...x, ...change } : x)));
  }

  /** Same shape as FolderUI's mapEntriesToFolderEnergies. */
  protected setKind(i: number, id: number): void {
    const k = this.kinds().find((x) => x.IdFolderTypeEnergiaKind === id);
    this.set(i, { IdEnergiaKind: k?.IdFolderTypeEnergiaKind, EnergiaKind: k ? { IdFolderEnergiaKind: k.IdFolderTypeEnergiaKind, Title: k.Title } : {} });
  }

  protected setDate(i: number, v: string): void {
    if (!v) return this.set(i, { EnergiaDate: '' });
    const [y, m, d] = v.split('-').map(Number);
    this.set(i, { EnergiaDate: `/Date(${new Date(y, m - 1, d).getTime()}-0000)/` });
  }

  protected setResponsible(picks: PickItem[]): void {
    const i = this.picking();
    const p = picks[0];
    if (i === null) return;
    this.set(i, { IdResponsibleUser: p?.id ?? null, ResponsibleUser: p ? userFromPick(p) : null });
    this.picking.set(null);
  }
}
