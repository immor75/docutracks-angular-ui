import { ChangeDetectionStrategy, Component, Injectable, inject, signal } from '@angular/core';
import { Icon } from './icon';

export interface Toast {
  id: number;
  kind: 'success' | 'error' | 'info';
  text: string;
}

/** Short confirmations after an action. Errors stay until closed; others fade after 5 s. */
@Injectable({ providedIn: 'root' })
export class Toasts {
  private seq = 0;
  readonly items = signal<Toast[]>([]);

  show(kind: Toast['kind'], text: string): void {
    const id = ++this.seq;
    this.items.update((l) => [...l.slice(-3), { id, kind, text }]);
    if (kind !== 'error') setTimeout(() => this.dismiss(id), 5000);
  }

  success(text: string): void {
    this.show('success', text);
  }

  error(text: string): void {
    this.show('error', text);
  }

  dismiss(id: number): void {
    this.items.update((l) => l.filter((t) => t.id !== id));
  }
}

@Component({
  selector: 'app-toasts',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="region" role="status" aria-live="polite">
      @for (t of toasts.items(); track t.id) {
        <div [class]="'toast toast--' + t.kind">
          <app-icon [name]="t.kind === 'error' ? 'alert' : t.kind === 'success' ? 'done' : 'info'" [size]="18" />
          <p>{{ t.text }}</p>
          <button type="button" class="btn btn--ghost btn--icon" (click)="toasts.dismiss(t.id)" aria-label="Κλείσιμο μηνύματος">
            <app-icon name="close" [size]="16" />
          </button>
        </div>
      }
    </div>
  `,
  styles: `
    .region {
      position: fixed; z-index: 100; right: var(--s-4); bottom: var(--s-4); display: grid; gap: var(--s-2);
      width: min(420px, calc(100vw - 2 * var(--s-4)));
    }
    .toast {
      display: flex; align-items: flex-start; gap: var(--s-2); padding: var(--s-2) var(--s-2) var(--s-2) var(--s-3);
      border-radius: var(--r-md); background: var(--shade-7); color: var(--white); box-shadow: var(--shadow-2);
      font-size: var(--fs-small); animation: in 0.16s ease-out;
    }
    .toast p { flex: 1; margin: 7px 0; }
    .toast app-icon { margin-top: 7px; }
    .toast--success app-icon { color: #7ee08b; }
    .toast--error { background: var(--notice-dark); }
    .toast .btn { color: inherit; min-height: 32px; width: 32px; }
    .toast .btn:hover { background: rgba(255, 255, 255, 0.12); }
    @keyframes in { from { opacity: 0; transform: translateY(6px); } }
    @media (prefers-reduced-motion: reduce) { .toast { animation: none; } }
  `,
})
export class ToastHost {
  protected readonly toasts = inject(Toasts);
}
