import { CanDeactivateFn, Routes } from '@angular/router';
import { DocumentsPage } from './documents-page';

/** Asks before leaving a registration with typed values (the page shows its own dialog). */
const leaveRegistration: CanDeactivateFn<{ confirmLeave(): boolean | Promise<boolean> }> = (page) => page.confirmLeave();

/** Έγγραφα, mounted at `/documents` (lazy chunk). */
export const DOCUMENT_ROUTES: Routes = [
  // «Νέο έγγραφο»: full page, its own lazy chunk. Before the list, so "new" is not an id.
  {
    path: 'new',
    title: 'Νέο έγγραφο · Docutracks',
    loadComponent: () => import('./new/register-page').then((m) => m.RegisterPage),
    canDeactivate: [leaveRegistration],
  },
  // «Επεξεργασία» (UiEdit): the same page with the document's values.
  {
    path: ':id/edit',
    title: 'Επεξεργασία εγγράφου · Docutracks',
    loadComponent: () => import('./new/register-page').then((m) => m.RegisterPage),
    canDeactivate: [leaveRegistration],
  },
  {
    path: '',
    title: 'Έγγραφα · Docutracks',
    component: DocumentsPage,
    children: [
      {
        path: ':id',
        loadComponent: () => import('./document-detail').then((m) => m.DocumentDetail),
      },
    ],
  },
];
