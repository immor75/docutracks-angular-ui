import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, firstValueFrom } from 'rxjs';
import { FoldersApi } from '../../core/folders-api';
import { errorMessage } from '../../core/http';
import { FolderActionResponse, UiAction } from '../../core/models';
import { Toasts } from '../../ui/toasts';
import { ActionSpec, CLASSIC_URL, specFor } from './action-catalog';

export interface ActionTarget {
  id: number;
  name: string;
}

export interface OpenAction {
  code: string;
  name: string;
  spec: ActionSpec;
  targets: ActionTarget[];
  /** Folder type instance of the list, used by "Αποστολή" to find the allowed groups. */
  instanceId: number | null;
  /** Changes on every open; stays the same when a partial failure narrows the targets. */
  seq: number;
}

export interface RunProgress {
  done: number;
  total: number;
  failed: { target: ActionTarget; message: string }[];
}

/**
 * Opens the right dialog for an action code and runs the calls it builds, one folder at
 * a time (a mass action on 30 folders is 30 calls, as in the API), then refreshes the
 * list and the open folder once.
 */
@Injectable()
export class ActionRunner {
  private readonly api = inject(FoldersApi);
  private readonly toasts = inject(Toasts);
  private readonly router = inject(Router);

  private seq = 0;
  readonly current = signal<OpenAction | null>(null);
  readonly progress = signal<RunProgress | null>(null);
  /** Detail panel listens to this to switch to the history tab. */
  readonly historyFor = signal<number | null>(null);

  open(action: UiAction, targets: ActionTarget[], instanceId: number | null): void {
    if (!action.CanExecute || !targets.length) return;
    const spec = specFor(action.UiActionCode);
    if (spec.kind === 'hidden') return;
    if (spec.kind === 'history') {
      this.historyFor.set(targets[0].id);
      return;
    }
    if (spec.kind === 'new' || spec.kind === 'edit') {
      const back = this.router.url;
      const inst = instanceId ? `&inst=${instanceId}` : '';
      void this.router.navigateByUrl(
        spec.kind === 'new'
          ? `/new?back=${encodeURIComponent(back)}${inst}`
          : `/${targets[0].id}/edit?back=${encodeURIComponent(back)}`,
      );
      return;
    }
    if (spec.kind === 'classic') {
      window.open(CLASSIC_URL, '_blank', 'noopener');
      return;
    }
    this.progress.set(null);
    this.current.set({ code: action.UiActionCode, name: action.UiActionName, spec, targets, instanceId, seq: ++this.seq });
  }

  close(): void {
    if (this.running()) return;
    this.current.set(null);
    this.progress.set(null);
  }

  running(): boolean {
    const p = this.progress();
    return !!p && p.done < p.total;
  }

  /**
   * Runs `call` for every target in order. Returns true when all succeeded; on partial
   * failure the dialog stays open and lists what failed.
   */
  async run(call: (t: ActionTarget) => Observable<unknown>): Promise<boolean> {
    const open = this.current();
    if (!open || this.running()) return false;
    const total = open.targets.length;
    this.progress.set({ done: 0, total, failed: [] });
    const results: { target: ActionTarget; res: unknown }[] = [];

    for (const target of open.targets) {
      try {
        results.push({ target, res: await firstValueFrom(call(target)) });
        this.progress.update((p) => p && { ...p, done: p.done + 1 });
      } catch (e) {
        this.progress.update(
          (p) => p && { ...p, done: p.done + 1, failed: [...p.failed, { target, message: errorMessage(e) }] },
        );
      }
    }

    if (results.length) this.api.changed();
    const failed = this.progress()?.failed ?? [];
    const label = open.spec.title ?? open.name;

    if (!failed.length) {
      this.toasts.success(total > 1 ? `${label}: ολοκληρώθηκε για ${total} υποθέσεις.` : `${label}: ολοκληρώθηκε.`);
      this.current.set(null);
      this.progress.set(null);
      this.afterSuccess(open, results);
      return true;
    }
    if (results.length) {
      this.toasts.show('info', `${label}: ${results.length} από ${total} ολοκληρώθηκαν.`);
      // A retry should only touch the folders that failed.
      this.current.set({ ...open, targets: failed.map((f) => f.target) });
    }
    return false;
  }

  /** Delete closes the panel of the deleted folder; clone opens the copy. */
  private afterSuccess(open: OpenAction, results: { target: ActionTarget; res: unknown }[]): void {
    const openId = /^\/(\d+)(?:[?#]|$)/.exec(this.router.url)?.[1];
    if (open.code.endsWith('_UiDelete') && openId && open.targets.some((t) => String(t.id) === openId)) {
      void this.router.navigate(['/'], { queryParamsHandling: 'preserve' });
    }
    if (open.code.endsWith('_UiClone') && results.length === 1) {
      const copy = (results[0].res as FolderActionResponse | undefined)?.Folder?.IdFolder;
      if (copy && copy !== results[0].target.id) {
        void this.router.navigate(['/', copy], { queryParamsHandling: 'preserve' });
      }
    }
  }
}
