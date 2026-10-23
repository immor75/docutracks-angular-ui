import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CLASSIC, DOCUMENTS, FOLDERS } from '../../core/paths';
import { Session } from '../../core/session';
import { Icon } from '../../ui/icon';

/** Morning until 12:00, then afternoon; Greek greetings. */
export function greeting(hour: number): string {
  return hour >= 5 && hour < 12 ? 'Καλημέρα' : 'Καλησπέρα';
}

/**
 * Αρχική σελίδα: the user's control panel. For now it leads to the two sections;
 * widgets (εκκρεμότητες, ειδοποιήσεις) come here as their APIs are defined.
 */
@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard {
  protected readonly session = inject(Session);
  protected readonly DOCUMENTS = DOCUMENTS;
  protected readonly FOLDERS = FOLDERS;

  protected readonly hello = computed(() => {
    const first = this.session.displayName().split(/\s+/).find(Boolean);
    return first ? `${greeting(new Date().getHours())}, ${first}` : greeting(new Date().getHours());
  });

  protected readonly groupName = computed(
    () => this.session.groups().find((g) => g.Id === this.session.groupId())?.GroupName ?? '',
  );

  protected readonly classicDocuments = computed(() => CLASSIC.documents(this.session.groupId()));
  protected readonly classicFolders = CLASSIC.folders;
  protected readonly classicNewDocument = computed(() => CLASSIC.newDocument(this.session.groupId()));
}
