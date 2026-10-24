import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { CLASSIC, DOCUMENTS, FOLDERS, sectionOf } from '../core/paths';
import { Session } from '../core/session';
import { Icon, IconName } from '../ui/icon';
import { ToastHost } from '../ui/toasts';

interface Section {
  key: 'home' | 'documents' | 'folders';
  path: string;
  label: string;
  icon: IconName;
  exact: boolean;
}

/**
 * Common frame of the app, as FolderUI: a header (logo, module title, group in the middle, classic UI
 * and user menu) and a rail on the left with one button per module (Αρχική, Έγγραφα, Υποθέσεις).
 * On small screens the rail gives way to icons in the header. The active section sets the accent
 * colour through `data-section`.
 */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon, ToastHost],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shell.html',
  styleUrl: './shell.css',
  host: { '[attr.data-section]': 'sectionName()' },
})
export class Shell {
  protected readonly session = inject(Session);
  private readonly router = inject(Router);

  protected readonly sections: Section[] = [
    { key: 'home', path: '/', label: 'Αρχική', icon: 'home', exact: true },
    { key: 'documents', path: DOCUMENTS, label: 'Έγγραφα', icon: 'file', exact: false },
    { key: 'folders', path: FOLDERS, label: 'Υποθέσεις', icon: 'folder', exact: false },
  ];

  /** The tools of FolderUI's header; not connected yet. */
  protected readonly tools: { id: string; label: string; icon: IconName; empty: string }[] = [
    { id: 'tool-apps', label: 'Πρόσθετες εφαρμογές', icon: 'apps', empty: 'Οι εφαρμογές του Docutracks θα εμφανίζονται εδώ.' },
    { id: 'tool-tasks', label: 'Εργασίες', icon: 'tasks', empty: 'Δεν υπάρχουν εργασίες ακόμη.' },
    { id: 'tool-notifications', label: 'Ειδοποιήσεις', icon: 'bell', empty: 'Δεν υπάρχουν ειδοποιήσεις.' },
    { id: 'tool-settings', label: 'Διαχείριση', icon: 'settings', empty: 'Οι ρυθμίσεις διαχείρισης θα εμφανίζονται εδώ.' },
  ];

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  protected readonly section = computed(() => sectionOf(this.url()));
  protected readonly sectionName = computed(() => this.section().slice(1) || 'home');

  /** The title next to the logo, as the module title of FolderUI. */
  protected readonly moduleTitle = computed(() => this.sections.find((s) => s.path === this.section())?.label ?? 'Αρχική');

  protected readonly groupName = computed(() => this.session.groups().find((g) => g.Id === this.session.groupId())?.GroupName ?? '');

  /** The classic page that matches where the user is. */
  protected readonly classic = computed(() =>
    this.section() === FOLDERS
      ? { href: CLASSIC.folders, title: 'Άνοιγμα του υπάρχοντος FolderUI' }
      : { href: CLASSIC.documents(this.session.groupId()), title: 'Άνοιγμα του υπάρχοντος καταλόγου εγγράφων' },
  );

  protected readonly initials = computed(() =>
    this.session
      .displayName()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join(''),
  );

  protected changeGroup(event: Event): void {
    const id = Number((event.target as HTMLSelectElement).value);
    this.session.selectGroup(id);
    // A different group sees different lists: stay in the section, start from a clean list.
    void this.router.navigate([this.section()], { queryParams: {} });
  }

  protected logout(): void {
    document.getElementById('user-menu')?.hidePopover?.();
    this.session.logout();
    void this.router.navigate(['/login']);
  }
}
