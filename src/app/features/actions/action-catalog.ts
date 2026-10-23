import { ActionEndpoint } from '../../core/actions-api';
import { CLASSIC } from '../../core/paths';

/**
 * How each FolderUI action code is carried out here. Codes and request shapes follow
 * FolderUI's dispatcher (`ui-folder-action-view.handleAction`) and Postman 58112.
 *
 *  - confirm     → optional/required comment, then POST `/v2/folders/action/`
 *  - assign      → user picker, POST `/v2/folders/assign/` with AssigneesIds
 *  - send        → one target group, POST `/v2/folders/action/` with SelectedTargetOwningGroupId
 *  - share       → groups (and users when EnableShareFolderToUsers), POST `/v2/folders/share/`
 *  - changeType  → pick an instance, POST `/v2/folders/change-type/`
 *  - print       → pick documents, POST `/v2/folders/massive-print/` → PDF
 *  - new / edit  → opens the editor (Καταχώριση / Επεξεργασία)
 *  - history     → opens the "Ιστορικό" tab of the folder
 *  - classic     → not available here (BPMN tasks and the rest): opens the classic FolderUI
 *  - hidden      → nothing to do in this UI (we are already viewing the folder)
 */
export type ActionKind = 'new' | 'edit' | 'confirm' | 'assign' | 'send' | 'share' | 'changeType' | 'print' | 'history' | 'classic' | 'hidden';

export interface ActionSpec {
  kind: ActionKind;
  /** Dialog title; falls back to the server's UiActionName. */
  title?: string;
  /** One sentence above the form. `{n}` is replaced with the folder name or count. */
  text?: string;
  confirm?: string;
  danger?: boolean;
  comment?: 'none' | 'optional' | 'required';
  endpoint?: ActionEndpoint;
  /** Archive: start from the comment of the last energia when FolderArchiveAutoCompleteComment is on. */
  prefillLastEnergia?: boolean;
  /** Can run on several selected folders at once. */
  mass?: boolean;
}

const P = 'FoldersModule_Ui';

export const ACTIONS: Record<string, ActionSpec> = {
  [P + 'Archive']: {
    kind: 'confirm',
    title: 'Αρχειοθέτηση',
    text: 'Η υπόθεση {n} θα αρχειοθετηθεί.',
    confirm: 'Αρχειοθέτηση',
    comment: 'optional',
    prefillLastEnergia: true,
    endpoint: 'action',
    mass: true,
  },
  [P + 'UnArchive']: {
    kind: 'confirm',
    title: 'Αναίρεση αρχειοθέτησης',
    text: 'Η υπόθεση {n} θα επανέλθει σε εξέλιξη.',
    confirm: 'Αναίρεση αρχειοθέτησης',
    comment: 'optional',
    endpoint: 'action',
    mass: true,
  },
  [P + 'Return']: {
    kind: 'confirm',
    title: 'Επιστροφή',
    text: 'Η υπόθεση {n} θα επιστραφεί.',
    confirm: 'Επιστροφή',
    comment: 'optional',
    endpoint: 'action',
    mass: true,
  },
  [P + 'TakeOwnership']: {
    kind: 'confirm',
    title: 'Ανάληψη ελέγχου',
    text: 'Θα αναλάβετε τον έλεγχο της υπόθεσης {n}.',
    confirm: 'Ανάληψη',
    comment: 'none',
    endpoint: 'action',
    mass: true,
  },
  [P + 'Clone']: {
    kind: 'confirm',
    title: 'Κλωνοποίηση',
    text: 'Θα δημιουργηθεί αντίγραφο της υπόθεσης {n}.',
    confirm: 'Κλωνοποίηση',
    comment: 'none',
    endpoint: 'action',
  },
  [P + 'Delete']: {
    kind: 'confirm',
    title: 'Διαγραφή',
    text: 'Η υπόθεση {n} θα διαγραφεί.',
    confirm: 'Διαγραφή',
    danger: true,
    comment: 'optional',
    endpoint: 'action',
    mass: true,
  },
  [P + 'Assign']: { kind: 'assign', title: 'Χρέωση', confirm: 'Χρέωση', endpoint: 'assign', mass: true },
  [P + 'Send']: { kind: 'send', title: 'Αποστολή', confirm: 'Αποστολή', comment: 'optional', endpoint: 'action', mass: true },
  [P + 'Share']: { kind: 'share', title: 'Κοινή χρήση', confirm: 'Αποθήκευση', endpoint: 'share' },
  [P + 'ChangeType']: { kind: 'changeType', title: 'Αλλαγή τύπου', confirm: 'Αλλαγή', comment: 'optional', endpoint: 'changeType' },
  [P + 'MassivePrint']: { kind: 'print', title: 'Μαζική εκτύπωση', confirm: 'Εκτύπωση' },
  [P + 'ViewHist']: { kind: 'history' },
  [P + 'New']: { kind: 'new' },
  [P + 'Edit']: { kind: 'edit' },
  [P + 'ViewDoc']: { kind: 'hidden' },
  [P + 'ViewFolderDetails']: { kind: 'hidden' },
};

/** Codes not listed (BPMN tasks, …) open the classic FolderUI. */
export function specFor(code: string): ActionSpec {
  return ACTIONS[code] ?? { kind: 'classic' };
}

export const CLASSIC_URL = CLASSIC.folders;
