import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { SubscriptionStateService } from './subscription-state.service';
import { ToastService } from './core/toast.service';

/**
 * 1. Attaches JWT Bearer token to every outgoing request.
 * 2. Redirects to /login on 401 (expired/invalid token).
 * 3. Redirects to /subscription on 402 only when freeTierForAll is NOT enabled.
 * 4. Shows user-friendly toast messages for network / server errors.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth     = inject(AuthService);
  const router   = inject(Router);
  const subState = inject(SubscriptionStateService);
  const toast    = inject(ToastService);
  const token    = auth.getToken();

  if (token && !req.headers.has('Authorization')) {
    req = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }

  return next(req).pipe(
    catchError(err => {
      if (err.status === 401) {
        auth.logout();
        router.navigate(['/login']);
        toast.error('Your session has expired. Please log in again.');
      }

      if (err.status === 402) {
        // Only redirect when the admin has NOT enabled free-for-all access.
        // subState.current is read synchronously from the cached value set by
        // the subscription guard — no extra HTTP call needed.
        if (!subState.current.freeTierForAll) {
          router.navigate(['/subscription']);
        }
      }

      if (err.status === 0) {
        toast.error('Cannot reach the server. Please check your internet connection.');
      } else if (err.status === 500) {
        toast.error('Something went wrong on our end. Please try again in a moment.');
      } else if (err.status === 503) {
        toast.error('Service is temporarily unavailable. Please try again shortly.');
      } else if (err.status === 429) {
        toast.warning('Too many requests. Please slow down and try again.');
      }

      return throwError(() => err);
    })
  );
};
