import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/**
 * 1. Attaches JWT Bearer token to every outgoing request.
 * 2. Redirects to /login on 401 (expired/invalid token).
 * 3. Redirects to /subscription on 402 (subscription required).
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth   = inject(AuthService);
  const router = inject(Router);
  const token  = auth.getToken();

  if (token && !req.headers.has('Authorization')) {
    req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }

  return next(req).pipe(
    catchError(err => {
      if (err.status === 401) {
        auth.logout();
        router.navigate(['/login']);
      }
      if (err.status === 402) {
        router.navigate(['/subscription']);
      }
      return throwError(() => err);
    })
  );
};
