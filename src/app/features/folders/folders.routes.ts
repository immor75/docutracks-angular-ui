import { CanDeactivateFn, Routes } from '@angular/router';
import { FolderListPage } from './list-page';

/** Asks before leaving the editor with unsaved changes (the page shows its own dialog). */
const leaveEditor: CanDeactivateFn<{ confirmLeave(): boolean | Promise<boolean> }> = (page) => page.confirmLeave();

/** Υποθέσεις, mounted at `/folders` (lazy chunk). */
export const FOLDER_ROUTES: Routes = [
  // Editor: full page, its own lazy chunk. Declared before the list so "new" is not a folder id.
  {
    path: 'new',
    title: 'Νέα υπόθεση · Docutracks',
    loadComponent: () => import('../editor/editor-page').then((m) => m.EditorPage),
    canDeactivate: [leaveEditor],
  },
  {
    path: ':id/edit',
    title: 'Επεξεργασία υπόθεσης · Docutracks',
    loadComponent: () => import('../editor/editor-page').then((m) => m.EditorPage),
    canDeactivate: [leaveEditor],
  },
  {
    path: '',
    component: FolderListPage,
    title: 'Υποθέσεις · Docutracks',
    children: [
      {
        path: ':id',
        loadComponent: () => import('../folder-detail/folder-detail').then((m) => m.FolderDetail),
      },
    ],
  },
];
