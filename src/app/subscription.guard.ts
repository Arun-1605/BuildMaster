import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { SubscriptionStateService } from './subscription-state.service';
import { map } from 'rxjs';

/**
 * Blocks route access for Free-tier users when subscriptions are required.
 * Uses SubscriptionStateService so the interceptor can also read the cached
 * result without making a duplicate HTTP call.
 */
export const subscriptionGuard: CanActivateFn = () => {
  const auth     = inject(AuthService);
  const router   = inject(Router);
  const subState = inject(SubscriptionStateService);

  if (!auth.isAuthenticated()) {
    router.navigate(['/login']);
    return false;
  }

  // Owner bypasses subscription check
  if (auth.isOwner()) return true;

  // If already premium (local claim), allow through
  const user = auth.getCurrentUser();
  const tier = user?.subscriptionTier ?? user?.SubscriptionTier ?? 'Free';
  if (tier !== 'Free') return true;

  // Fetch (or replay cached) subscription settings from backend
  return subState.fetch().pipe(
    map(settings => {
      // Allow if subscription feature is off OR admin enabled free-for-all
      if (!settings.subscriptionEnabled || settings.freeTierForAll) return true;
      // Free-tier user with active subscription wall → send to upgrade page
      router.navigate(['/subscription']);
      return false;
    })
  );
};
