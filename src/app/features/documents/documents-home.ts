import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CLASSIC } from '../../core/paths';
import { Session } from '../../core/session';
import { Icon } from '../../ui/icon';

/** Placeholder of the Έγγραφα section until the list arrives (phase 2). */
@Component({
  selector: 'app-documents-home',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <h1 class="title">Έγγραφα</h1>
      <p class="text">
        Ο νέος κατάλογος εγγράφων ετοιμάζεται. Μέχρι τότε, τα έγγραφα της υπηρεσίας ανοίγουν στο κλασικό UI.
      </p>
      <a class="btn btn--primary" [href]="classic()">
        <app-icon name="external" [size]="18" /> Κατάλογος εγγράφων (κλασικό UI)
      </a>
    </div>
  `,
  styles: `
    :host { display: block; height: 100%; overflow: auto; }
    .page { max-width: 720px; margin: 0 auto; padding: var(--s-6) var(--s-5); }
    .title { margin: 0 0 var(--s-2); font-size: var(--fs-h2); line-height: var(--lh-h2); font-weight: 600; }
    .text { margin: 0 0 var(--s-4); color: var(--secondary); }
  `,
})
export class DocumentsHome {
  private readonly session = inject(Session);
  protected readonly classic = computed(() => CLASSIC.documents(this.session.groupId()));
}
