import { CanDeactivateFn, Routes } from '@angular/router';
import { signedIn } from './core/http';
import { FolderListPage } from './features/folders/list-page';
import { Shell } from './shell/shell';

/** Asks before leaving the editor with unsaved changes (the page shows its own dialog). */
const leaveEditor: CanDeactivateFn<{ confirmLeave(): boolean | Promise<boolean> }> = (page) => page.confirmLeave();

export const routes: Routes = [
  {
    path: 'login',
    title: 'Σύνδεση · Υποθέσεις',
    loadComponent: () => import('./features/login/login-page').then((m) => m.LoginPage),
  },
  {
    path: '',
    component: Shell,
    canMatch: [signedIn],
    children: [
      // Editor: full page, its own lazy chunk. Declared before the list so "new" is not a folder id.
      {
        path: 'new',
        title: 'Νέα υπόθεση · Docutracks',
        loadComponent: () => import('./features/editor/editor-page').then((m) => m.EditorPage),
        canDeactivate: [leaveEditor],
      },
      {
        path: ':id/edit',
        title: 'Επεξεργασία υπόθεσης · Docutracks',
        loadComponent: () => import('./features/editor/editor-page').then((m) => m.EditorPage),
        canDeactivate: [leaveEditor],
      },
      {
        path: '',
        component: FolderListPage,
        title: 'Υποθέσεις · Docutracks',
        children: [
          {
            path: ':id',
            loadComponent: () => import('./features/folder-detail/folder-detail').then((m) => m.FolderDetail),
          },
        ],
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
