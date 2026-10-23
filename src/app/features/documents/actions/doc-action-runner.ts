import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, firstValueFrom } from 'rxjs';
import { DocumentsApi } from '../../../core/documents-api';
import { ActionResult, ActionValue, RunActionPayload } from '../../../core/documents-models';
import { errorMessage } from '../../../core/http';
import { openDocumentId } from '../../../core/paths';
import { Session } from '../../../core/session';
import { Toasts } from '../../../ui/toasts';
import { DocumentListStore } from '../document-list.store';

/**
 * Actions this UI runs itself (phase 6): the form comes from `GET action-data/{code}`, the
 * run goes to `POST action`. Everything else stays a link to the classic UI until its phase
 * (new document, answer and clone: 8; signatures: 7).
 */
export const IN_APP = new Set([
  // wave α: confirmation with a comment
  'UiArchive', 'UiUnArchive', 'UiCancel', 'UiDelete', 'UiUnAssign', 'UiReturn', 'UiFreeze', 'UiUnfreeze',
  // wave β: people
  'UiAssign', 'UiNotify', 'UiInform', 'UiChangeCreator',
  // wave γ: groups
  'UiSend', 'UiSendToChild', 'UiSendToFirstLevelChild',
  // phase 7: signing has its own dialog
  'UiSign',
]);

/** Signing: its own dialog and `POST sign`, not the generic action form. */
export const SIGN = 'UiSign';

export interface DocTarget {
  id: number;
  title: string;
}

export interface OpenDocAction {
  code: string;
  name: string;
  targets: DocTarget[];
  /** New on every open; a retry after a partial failure keeps it, so the form keeps its values. */
  seq: number;
}

export interface Failure {
  target: DocTarget;
  message: string;
}

/** Opens the action dialog and runs the action; one per documents page. */
@Injectable()
export class DocActionRunner {
  private readonly api = inject(DocumentsApi);
  private readonly session = inject(Session);
  private readonly toasts = inject(Toasts);
  private readonly list = inject(DocumentListStore);
  private readonly router = inject(Router);

  private seq = 0;
  readonly current = signal<OpenDocAction | null>(null);
  readonly busy = signal(false);
  readonly failures = signal<Failure[]>([]);

  open(code: string, name: string, targets: DocTarget[]): void {
    if (!targets.length || this.busy()) return;
    this.failures.set([]);
    this.current.set({ code, name, targets, seq: ++this.seq });
  }

  close(): void {
    if (this.busy()) return;
    this.current.set(null);
    this.failures.set([]);
  }

  /**
   * Runs the open action with the form's values. All done: closes and confirms. Some failed:
   * stays open, lists why, and a retry only touches those documents.
   */
  run(title: string, values: Record<string, ActionValue>): Promise<boolean> {
    return this.execute(title, (groupId, code, ids) =>
      this.api.runAction({ GroupId: groupId, Code: code, DocumentIds: ids, Values: values }),
    );
  }

  /**
   * Runs any call that answers with one result per document (`POST action`, `POST sign`).
   * Resolves to true when every document succeeded and the dialog closed.
   */
  async execute(
    title: string,
    call: (groupId: number, code: string, ids: number[]) => Observable<RunActionPayload>,
  ): Promise<boolean> {
    const open = this.current();
    const groupId = this.session.groupId();
    if (!open || !groupId || this.busy()) return false;
    this.busy.set(true);
    this.failures.set([]);
    let results: ActionResult[];
    try {
      const r = await firstValueFrom(call(groupId, open.code, open.targets.map((t) => t.id)));
      results = r.Results;
    } catch (e) {
      this.busy.set(false);
      this.failures.set(open.targets.map((target) => ({ target, message: errorMessage(e) })));
      return false;
    }
    this.busy.set(false);

    const byId = new Map(results.map((r) => [r.DocumentId, r]));
    const failed: Failure[] = open.targets
      .filter((t) => !byId.get(t.id)?.Success)
      .map((target) => ({ target, message: byId.get(target.id)?.Message || 'Η ενέργεια δεν ολοκληρώθηκε.' }));
    const done = open.targets.length - failed.length;
    // Mass actions: what is done leaves the selection, what failed stays selected.
    this.list.deselect(open.targets.filter((t) => byId.get(t.id)?.Success).map((t) => t.id));

    // A deleted document cannot stay open beside the list.
    const openId = openDocumentId(this.router.url);
    if (open.code === 'UiDelete' && openId !== null && byId.get(openId)?.Success) this.list.close();
    if (!failed.length) {
      this.toasts.success(open.targets.length > 1 ? `${title}: ολοκληρώθηκε για ${done} έγγραφα.` : `${title}: ολοκληρώθηκε.`);
      this.current.set(null);
      return true;
    }
    if (done) {
      this.toasts.show('info', `${title}: ${done} από ${open.targets.length} ολοκληρώθηκαν.`);
      this.current.set({ ...open, targets: failed.map((f) => f.target) });
    }
    this.failures.set(failed);
    return false;
  }
}
