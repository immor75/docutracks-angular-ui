import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { Session } from '../core/session';
import { Icon } from '../ui/icon';
import { ToastHost } from '../ui/toasts';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, Icon, ToastHost],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shell.html',
  styleUrl: './shell.css',
})
export class Shell {
  protected readonly session = inject(Session);
  private readonly router = inject(Router);

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
    // A different group sees different folder types: start from a clean list.
    void this.router.navigate(['/'], { queryParams: {} });
  }

  protected logout(): void {
    this.session.logout();
    void this.router.navigate(['/login']);
  }
}
