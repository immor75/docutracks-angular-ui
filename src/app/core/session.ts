import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CurrentUserAsLoginResponse, OrgGroup, OrgUser } from './models';

/**
 * Keys shared with the existing FolderUI (DocuLibrary DBkeys). Reusing them means a user
 * who is already signed in to FolderUI in the same tab does not sign in again, and
 * the 290 KB user lookup is skipped.
 */
const KEY = {
  token: 'access_token',
  user: 'current_user',
  group: 'fn.group',
} as const;

const FOLDERS_MODULE = 'FoldersModule';

function read<T>(storage: Storage, key: string): T | null {
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(storage: Storage, key: string, value: unknown): void {
  try {
    if (value === null || value === undefined) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable (private mode): keep the value in memory only */
  }
}

export type SessionStatus = 'unknown' | 'signed-in' | 'signed-out';

/** Background calls (prefetch, logout) must never surface errors. */
const ignore = (): void => undefined;

@Injectable({ providedIn: 'root' })
export class Session {
  private readonly http = inject(HttpClient);

  readonly status = signal<SessionStatus>('unknown');
  readonly token = signal<string | null>(read<string>(sessionStorage, KEY.token));
  readonly user = signal<OrgUser | null>(read<OrgUser>(sessionStorage, KEY.user));
  private readonly preferredGroup = signal<number | null>(read<number>(localStorage, KEY.group));

  /**
   * Groups (υπηρεσίες) of the user, in the order the server sends them. Documents exist in
   * every group; υποθέσεις only where the Folders module is active (see `hasFolders`).
   */
  private readonly groupsInServerOrder = computed<OrgGroup[]>(() => {
    const seen = new Map<number, OrgGroup>();
    for (const r of this.user()?.Relations ?? []) {
      const g = r.Group;
      if (g && !seen.has(g.Id)) seen.set(g.Id, g);
    }
    return [...seen.values()];
  });

  /** Same groups, sorted for the picker. */
  readonly groups = computed<OrgGroup[]>(() =>
    [...this.groupsInServerOrder()].sort((a, b) => (a.GroupName ?? '').localeCompare(b.GroupName ?? '', 'el')),
  );

  /**
   * The user's last choice, else the first group in server order, which is what FolderUI
   * selects (`buildGroupsList`), so both apps open on the same υπηρεσία.
   */
  readonly groupId = computed<number | null>(() => {
    const groups = this.groupsInServerOrder();
    const preferred = this.preferredGroup();
    if (preferred && groups.some((g) => g.Id === preferred)) return preferred;
    return groups[0]?.Id ?? null;
  });

  /** The selected group has the Folders module (FolderUI shows only these groups). */
  readonly hasFolders = computed(() => {
    const g = this.groupsInServerOrder().find((x) => x.Id === this.groupId());
    return !!g && (g.ActiveModules ?? []).includes(FOLDERS_MODULE);
  });

  readonly displayName = computed(() => {
    const u = this.user();
    return u?.DisplayName || [u?.FirstName, u?.LastName].filter(Boolean).join(' ') || u?.UserName || '';
  });

  private pending: Promise<boolean> | null = null;

  /** Resolves once we know whether the user is signed in. Safe to call many times. */
  ensure(): Promise<boolean> {
    if (this.status() === 'signed-in') return Promise.resolve(true);
    if (this.status() === 'signed-out') return Promise.resolve(false);
    this.pending ??= this.restore().finally(() => (this.pending = null));
    return this.pending;
  }

  selectGroup(id: number): void {
    this.preferredGroup.set(id);
    write(localStorage, KEY.group, id);
  }

  /** Username/password sign-in, same endpoint as FolderUI's login screen. */
  async login(username: string, password: string): Promise<void> {
    const body = new URLSearchParams({
      username,
      password,
      grant_type: 'password',
      scope: 'openid email phone profile offline_access roles',
      resource: location.origin,
    });
    const headers = new HttpHeaders({ 'Content-Type': 'application/x-www-form-urlencoded' });
    const res = await firstValueFrom(
      this.http.post<{ Success?: boolean }>('/services/authentication/login', body.toString(), { headers }),
    );
    if (res && res.Success === false) throw new Error('Λάθος όνομα χρήστη ή κωδικός.');
    if (!(await this.fromServerSession())) throw new Error('Η σύνδεση δεν ολοκληρώθηκε. Δοκιμάστε ξανά.');
  }

  logout(): void {
    const name = this.user()?.UserName;
    this.clear();
    if (name) {
      this.http.post('/services/authentication/logout', { userName: name }).subscribe({ error: ignore });
    }
  }

  /** Called by the interceptor on 401. */
  expire(): void {
    this.clear();
  }

  private clear(): void {
    write(sessionStorage, KEY.token, null);
    write(sessionStorage, KEY.user, null);
    this.token.set(null);
    this.user.set(null);
    this.status.set('signed-out');
  }

  private async restore(): Promise<boolean> {
    if (this.token() && this.user()?.Relations) {
      this.status.set('signed-in');
      return true;
    }
    return this.fromServerSession();
  }

  /** Exchanges the Docutracks cookie session for a token (same flow as FolderUI). */
  private async fromServerSession(): Promise<boolean> {
    try {
      const me = await firstValueFrom(
        this.http.get<CurrentUserAsLoginResponse>('/services/authentication/currentUserAsLogin'),
      );
      if (!me?.AccessToken) throw new Error('no token');
      this.token.set(me.AccessToken);
      write(sessionStorage, KEY.token, me.AccessToken);

      const res = await firstValueFrom(
        this.http.get<{ User: OrgUser }>(`/services/users/${encodeURIComponent(me.Name)}/`),
      );
      this.user.set(res.User);
      write(sessionStorage, KEY.user, res.User);
      this.status.set('signed-in');
      return true;
    } catch {
      this.clear();
      return false;
    }
  }
}
