import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { errorMessage } from '../../core/http';
import { Session } from '../../core/session';
import { Icon } from '../../ui/icon';

@Component({
  selector: 'app-login-page',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="wrap">
      <form class="card" (submit)="submit($event)" aria-labelledby="login-title">
        <span class="mark" aria-hidden="true"><app-icon name="folder" [size]="22" /></span>
        <h1 id="login-title">Υποθέσεις</h1>
        <p class="lead">Συνδεθείτε με τον λογαριασμό σας στο Docutracks.</p>

        <label class="field">
          <span>Όνομα χρήστη</span>
          <input class="input" name="username" autocomplete="username" required [disabled]="busy()" #u />
        </label>
        <label class="field">
          <span>Κωδικός</span>
          <input class="input" name="password" type="password" autocomplete="current-password" required [disabled]="busy()" #p />
        </label>

        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }

        <button type="submit" class="btn btn--primary" [disabled]="busy()">
          {{ busy() ? 'Σύνδεση…' : 'Σύνδεση' }}
        </button>
      </form>
    </main>
  `,
  styles: `
    .wrap { display: grid; place-items: center; min-height: 100dvh; padding: var(--s-4); background: var(--shade-1); }
    .card {
      display: grid; gap: var(--s-4); width: min(380px, 100%); padding: var(--s-6);
      background: var(--white); border-radius: var(--r-lg); box-shadow: var(--shadow-1);
    }
    .mark { display: grid; place-items: center; width: 44px; height: 44px; border-radius: var(--r-md); background: var(--accent); color: var(--white); }
    h1 { margin: 0; font-size: var(--fs-h2); line-height: var(--lh-h2); font-weight: 600; }
    .lead { margin: -8px 0 0; color: var(--secondary); font-size: var(--fs-small); }
    .input { min-height: 40px; }
    .btn { min-height: 40px; }
    .error { margin: 0; padding: var(--s-2) var(--s-3); border-radius: var(--r-md); background: var(--notice-bg); color: var(--notice-dark); font-size: var(--fs-small); }
  `,
})
export class LoginPage {
  readonly returnUrl = input<string>('/');
  private readonly session = inject(Session);
  private readonly router = inject(Router);

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.target as HTMLFormElement);
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.session.login(String(form.get('username') ?? ''), String(form.get('password') ?? ''));
      const target = this.returnUrl()?.startsWith('/') ? this.returnUrl() : '/';
      await this.router.navigateByUrl(target === '/login' ? '/' : target);
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
