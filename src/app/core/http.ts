import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { Session } from './session';

/**
 * One interceptor for every API call:
 *  - adds the bearer token to `/services/*` requests,
 *  - on 401 ends the session and sends the user to the login page, keeping where they were.
 * Unwrapping `Success=false` happens in the API layer, where the response shape is known.
 */
export const apiInterceptor: HttpInterceptorFn = (req, next) => {
  const session = inject(Session);
  const router = inject(Router);
  const token = session.token();
  const isApi = req.url.startsWith('/services/');
  const authReq = isApi && token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(authReq).pipe(
    catchError((err: unknown) => {
      const authCall = req.url.startsWith('/services/authentication/');
      if (err instanceof HttpErrorResponse && isApi && !authCall && (err.status === 401 || isLoginRedirect(err))) {
        session.expire();
        void router.navigate(['/login'], { queryParams: { returnUrl: router.url } });
      }
      return throwError(() => (isLoginRedirect(err) ? new SessionExpiredError() : err));
    }),
  );
};

/**
 * Docutracks does not answer 401 when the session cookie is missing or expired: Forms
 * authentication redirects to `/el/Account/LogOn`, which comes back as HTML with status 200.
 * HttpClient then fails to parse JSON. Treat that exactly like a 401.
 */
export function isLoginRedirect(err: unknown): boolean {
  if (!(err instanceof HttpErrorResponse)) return false;
  const body = typeof err.error?.text === 'string' ? err.error.text : '';
  return (
    /\/Account\/LogOn/i.test(err.url ?? '') ||
    (err.status === 200 && body.trimStart().startsWith('<'))
  );
}

export class SessionExpiredError extends Error {
  constructor() {
    super('Η σύνδεση έληξε. Συνδεθείτε ξανά.');
  }
}

export const signedIn: CanMatchFn = async (_route, segments) => {
  const session = inject(Session);
  const router = inject(Router);
  if (await session.ensure()) return true;
  const returnUrl = '/' + segments.map((s) => s.path).join('/');
  return router.createUrlTree(['/login'], { queryParams: { returnUrl } });
};

/** Human message for an error coming out of the API layer. */
export function errorMessage(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    if (isLoginRedirect(err)) return new SessionExpiredError().message;
    if (err.status === 0) return 'Δεν υπάρχει σύνδεση με τον διακομιστή.';
    if (err.status === 403) return 'Δεν έχετε δικαίωμα πρόσβασης.';
    if (err.status === 404) return 'Δεν βρέθηκε.';
    return `Σφάλμα διακομιστή (${err.status}).`;
  }
  if (err instanceof Error && err.message) return err.message;
  return 'Κάτι πήγε στραβά.';
}
