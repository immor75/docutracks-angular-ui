import { Injectable, signal } from '@angular/core';

export type NavSection = 'documents' | 'folders';

const KEY = 'dt-next:nav-collapsed';

/**
 * Whether the category menu on the left (φάκελοι εγγράφων, είδη υποθέσεων) is collapsed, per
 * section. A per-viewer convenience: kept in localStorage when it is available.
 */
@Injectable({ providedIn: 'root' })
export class NavPrefs {
  private readonly state = signal<Record<NavSection, boolean>>(this.read());

  collapsed(section: NavSection): boolean {
    return this.state()[section] === true;
  }

  toggle(section: NavSection): void {
    this.state.update((s) => ({ ...s, [section]: !s[section] }));
    try {
      localStorage.setItem(KEY, JSON.stringify(this.state()));
    } catch {
      // Private mode or blocked storage: the choice lasts until reload.
    }
  }

  private read(): Record<NavSection, boolean> {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Record<NavSection, boolean>>;
      return { documents: v.documents === true, folders: v.folders === true };
    } catch {
      return { documents: false, folders: false };
    }
  }
}
