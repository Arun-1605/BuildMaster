import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from './auth.service';
import { API_URLS } from './core/constants';
import { catchError, map, of } from 'rxjs';

/**
 * Blocks route access when the backend returns 402 (subscription required).
 * Falls back to allowing access when the payment endpoint is unreachable.
 */
export const subscriptionGuard: CanActivateFn = () => {
  const auth   = inject(AuthService);
  const router = inject(Router);
  const http   = inject(HttpClient);

  if (!auth.isAuthenticated()) {
    router.navigate(['/login']);
    return false;
  }

  // Owner bypasses subscription check
  if (auth.isOwner()) return true;

  // Quick local check using JWT claims stored in user object
  const user = auth.getCurrentUser();
  const tier = user?.subscriptionTier ?? 'Free';

  // If already premium locally, allow through (server will re-validate on actual API call)
  if (tier !== 'Free') return true;

  // Check live subscription status from backend
  return http.get<any>(API_URLS.PAYMENT_PLANS).pipe(
    map(data => {
      // If subscription not enabled or free tier for all, allow through
      if (!data.subscriptionEnabled || data.freeTierForAll) return true;
      // Free tier user with subscription enabled → redirect to subscription page
      router.navigate(['/subscription']);
      return false;
    }),
    catchError(() => of(true)) // Network error → allow through (fail open)
  );
};
