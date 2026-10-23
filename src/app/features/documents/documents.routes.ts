import { Routes } from '@angular/router';
import { DocumentsPage } from './documents-page';

/** Έγγραφα, mounted at `/documents` (lazy chunk). */
export const DOCUMENT_ROUTES: Routes = [
  {
    path: '',
    title: 'Έγγραφα · Docutracks',
    component: DocumentsPage,
  },
];
