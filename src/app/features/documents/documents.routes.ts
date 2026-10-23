import { Routes } from '@angular/router';

/** Έγγραφα, mounted at `/documents` (lazy chunk). Filled in from phase 2 on. */
export const DOCUMENT_ROUTES: Routes = [
  {
    path: '',
    title: 'Έγγραφα · Docutracks',
    loadComponent: () => import('./documents-home').then((m) => m.DocumentsHome),
  },
];
