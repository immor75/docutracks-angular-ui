import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { signedIn } from './core/http';
import { DOCUMENTS, FOLDERS } from './core/paths';
import { Shell } from './shell/shell';

/**
 * Links from before the split (`/?t=…`, `/<id>`, `/new`, `/<id>/edit`) were all folder URLs.
 * They keep working by moving under `/folders`, query included.
 */
const legacyListQuery: CanActivateFn = (route) =>
  Object.keys(route.queryParams).length ? inject(Router).createUrlTree([FOLDERS], { queryParams: route.queryParams }) : true;

export const routes: Routes = [
  {
    path: 'login',
    title: 'Σύνδεση · Docutracks',
    loadComponent: () => import('./features/login/login-page').then((m) => m.LoginPage),
  },
  {
    path: '',
    component: Shell,
    canMatch: [signedIn],
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: 'Αρχική · Docutracks',
        canActivate: [legacyListQuery],
        loadComponent: () => import('./features/home/dashboard').then((m) => m.Dashboard),
      },
      { path: FOLDERS.slice(1), loadChildren: () => import('./features/folders/folders.routes').then((m) => m.FOLDER_ROUTES) },
      { path: DOCUMENTS.slice(1), loadChildren: () => import('./features/documents/documents.routes').then((m) => m.DOCUMENT_ROUTES) },
      {
        path: 'new',
        redirectTo: ({ queryParams }) => inject(Router).createUrlTree([FOLDERS, 'new'], { queryParams }),
      },
      {
        path: ':id/edit',
        redirectTo: ({ params, queryParams }) =>
          inject(Router).createUrlTree([FOLDERS, params['id'], 'edit'], { queryParams }),
      },
      {
        path: ':id',
        redirectTo: ({ params, queryParams }) =>
          /^\d+$/.test(params['id'])
            ? inject(Router).createUrlTree([FOLDERS, params['id']], { queryParams })
            : inject(Router).createUrlTree(['/']),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
