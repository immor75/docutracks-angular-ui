import { Observable, shareReplay, tap } from 'rxjs';
import { Envelope } from './models';

/* Helpers shared by the API services (folders, documents). */

export function readSession<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeSession(key: string, value: unknown): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked: the in-memory cache still works */
  }
}

/** Throws when the backend answers 200 with `Success: false`. */
export function unwrap<T>(res: Envelope<T>): T {
  if (!res?.Success || res.Payload === undefined) {
    throw new Error(res?.ErrorInfo?.ExceptionMessage || res?.Message || 'Η αναζήτηση απέτυχε.');
  }
  return res.Payload;
}

interface CacheEntry<T> {
  at: number;
  value$: Observable<T>;
}

/**
 * A small time-boxed cache in front of read calls. It makes "back", "previous page" and
 * opening a folder that was prefetched on hover instant, without a state library.
 */
export class TtlCache {
  private readonly entries = new Map<string, CacheEntry<unknown>>();
  constructor(private readonly ttlMs: number, private readonly max = 100) {}

  get<T>(key: string, load: () => Observable<T>): Observable<T> {
    const hit = this.entries.get(key) as CacheEntry<T> | undefined;
    if (hit && Date.now() - hit.at < this.ttlMs) return hit.value$;
    const value$ = load().pipe(
      tap({ error: () => this.entries.delete(key) }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    this.entries.set(key, { at: Date.now(), value$ });
    if (this.entries.size > this.max) this.entries.delete(this.entries.keys().next().value!);
    return value$;
  }

  clear(): void {
    this.entries.clear();
  }
}
