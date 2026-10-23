import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { ActionsApi } from '../../../core/actions-api';
import { Icon } from '../../../ui/icon';
import { Sheet } from '../../../ui/sheet';
import { OrgPicker, PickItem, flattenTree } from '../../../shared/org-picker';
import { personName } from '../../../shared/format';
import { EditorApi } from '../editor-api';
import { ContactRole, ContactSearchHit, FolderContact } from '../editor-models';
import { EditorStore } from '../editor-store';
import { SearchPick } from '../search-pick';

type Kind = 'contact' | 'user' | 'group';

const KIND_LABEL: Record<Kind, string> = { contact: 'Επαφή', user: 'Χρήστης', group: 'Υπηρεσία' };

/** Εμπλεκόμενοι: επαφές, χρήστες και υπηρεσίες με ρόλο (folder-contacts + add-involved του FolderUI). */
@Component({
  selector: 'app-contacts-tab',
  imports: [Icon, Sheet, SearchPick, OrgPicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './contacts-tab.html',
  styleUrl: './tabs.css',
})
export class ContactsTab {
  protected readonly store = inject(EditorStore);
  private readonly api = inject(EditorApi);
  private readonly actions = inject(ActionsApi);
  protected readonly kindLabel = KIND_LABEL;

  protected readonly roles = computed<ContactRole[]>(() => (this.store.cfg().ContactRoles ?? []).filter((r) => r.IsActive));
  protected readonly contacts = computed(() => this.store.draft()!.FolderContacts);

  protected readonly byRole = computed(() => {
    const list = this.contacts();
    const roles = this.roles();
    const groups = roles.map((role) => ({
      role,
      items: list.filter((c) => c.IdFolderTypeContactRole === role.IdFolderTypeContactRole),
    }));
    const known = new Set(roles.map((r) => r.IdFolderTypeContactRole));
    const other = list.filter((c) => !known.has(c.IdFolderTypeContactRole));
    return { groups, other };
  });

  protected kindOf(c: FolderContact): Kind {
    return c.IdUser || c.User?.Id ? 'user' : c.IdGroup || c.Group?.Id ? 'group' : 'contact';
  }

  protected nameOf(c: FolderContact): string {
    const k = this.kindOf(c);
    if (k === 'user') return personName(c.User ?? undefined) || `Χρήστης ${c.IdUser}`;
    if (k === 'group') return c.Group?.GroupName || c.Group?.DisplayName || `Υπηρεσία ${c.IdGroup}`;
    return c.Contact?.Eponimia || personName(c.Contact ?? undefined) || `Επαφή ${c.IdContact}`;
  }

  protected limits(r: ContactRole): string {
    const parts: string[] = [];
    if (r.MinInvolvedContactsLimit) parts.push(`τουλάχιστον ${r.MinInvolvedContactsLimit}`);
    if (r.MaxInvolvedContactsLimit) parts.push(`έως ${r.MaxInvolvedContactsLimit}`);
    return parts.join(', ');
  }

  protected remove(c: FolderContact): void {
    this.store.list('FolderContacts', (l) => l.filter((x) => x !== c));
  }

  /* ---------- Προσθήκη ---------- */

  protected readonly adding = signal(false);
  protected readonly roleId = linkedSignal<number | null>(() => (this.adding() ? (this.roles()[0]?.IdFolderTypeContactRole ?? null) : null));
  protected readonly role = computed(() => this.roles().find((r) => r.IdFolderTypeContactRole === this.roleId()) ?? null);
  protected readonly kinds = computed<Kind[]>(() => {
    const r = this.role();
    if (!r) return [];
    return (['contact', 'user', 'group'] as Kind[]).filter((k) =>
      k === 'contact' ? r.AllowedForContacts : k === 'user' ? r.AllowedForUsers : r.AllowedForGroups,
    );
  });
  protected readonly kind = linkedSignal<Kind | null>(() => this.kinds()[0] ?? null);

  protected readonly pickedContacts = signal<ContactSearchHit[]>([]);
  protected readonly pickedOrg = signal<PickItem[]>([]);

  protected readonly tree = rxResource({
    params: () => (this.adding() && (this.kind() === 'user' || this.kind() === 'group') ? this.kind()! : undefined),
    stream: ({ params }) => this.actions.orgTree([1]).pipe(map((t) => flattenTree(t, params === 'user' ? 'users' : 'groups'))),
  });

  protected readonly searchContacts = (term: string, page: number) => this.api.contacts(term, page);
  protected readonly contactKey = (c: ContactSearchHit) => c.IdContact;
  protected readonly contactTitle = (c: ContactSearchHit) => c.Eponimia || personName(c) || `Επαφή ${c.IdContact}`;
  protected readonly contactMeta = (c: ContactSearchHit) =>
    [c.ContactType?.ContactTypeName !== '-' ? c.ContactType?.ContactTypeName : '', c.Afm ? 'ΑΦΜ ' + c.Afm : ''].filter(Boolean).join(' · ');

  protected readonly pickedCount = computed(() => (this.kind() === 'contact' ? this.pickedContacts().length : this.pickedOrg().length));

  protected openAdd(): void {
    this.pickedContacts.set([]);
    this.pickedOrg.set([]);
    this.adding.set(true);
  }

  protected setKind(k: Kind): void {
    this.kind.set(k);
    this.pickedContacts.set([]);
    this.pickedOrg.set([]);
  }

  protected confirmAdd(): void {
    const role = this.role();
    if (!role) return;
    const d = this.store.draft()!;
    const base = {
      IdFolderContact: 0,
      IdFolder: d.IdFolder,
      IdFolderTypeContactRole: role.IdFolderTypeContactRole,
      FolderTypeContactRole: { IdFolderTypeContactRole: role.IdFolderTypeContactRole, ContactRole: role.ContactRole },
    };
    const exists = (pred: (c: FolderContact) => boolean) =>
      d.FolderContacts.some((c) => c.IdFolderTypeContactRole === role.IdFolderTypeContactRole && pred(c));
    let added: FolderContact[] = [];
    if (this.kind() === 'contact') {
      added = this.pickedContacts()
        .filter((c) => !exists((x) => x.IdContact === c.IdContact))
        .map((c) => ({
          ...base,
          IdContact: c.IdContact,
          IdUser: null,
          IdGroup: null,
          Contact: { IdContact: c.IdContact, Eponimia: c.Eponimia, FirstName: c.FirstName, LastName: c.LastName, Afm: c.Afm },
        }));
    } else if (this.kind() === 'user') {
      added = this.pickedOrg()
        .filter((u) => !exists((x) => x.IdUser === u.id))
        .map((u) => ({ ...base, IdContact: null, IdUser: u.id, IdGroup: null, User: { Id: u.id, DisplayName: u.name, FirstName: u.name, LastName: '' } }));
    } else {
      added = this.pickedOrg()
        .filter((g) => !exists((x) => x.IdGroup === g.id))
        .map((g) => ({ ...base, IdContact: null, IdUser: null, IdGroup: g.id, Group: { Id: g.id, GroupName: g.name } }));
    }
    this.store.list('FolderContacts', (l) => [...l, ...added]);
    this.adding.set(false);
  }
}
