import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, shareReplay, catchError, map, tap } from 'rxjs';
import { API_URLS } from './core/constants';

export interface SubscriptionSettings {
  subscriptionEnabled: boolean;
  freeTierForAll: boolean;
}

/**
 * Singleton cache for subscription settings.
 * The guard writes the cache; the interceptor reads it synchronously
 * so it can decide whether a 402 response should redirect to /subscription.
 */
@Injectable({ providedIn: 'root' })
export class SubscriptionStateService {
  // Default: allow all until we hear otherwise from the backend.
  private _settings: SubscriptionSettings = { subscriptionEnabled: false, freeTierForAll: true };
  private settings$: Observable<SubscriptionSettings> | null = null;

  constructor(private http: HttpClient) {}

  /** Synchronous last-known value — safe to call from the interceptor. */
  get current(): SubscriptionSettings { return this._settings; }

  /** Async fetch — makes exactly one HTTP call per session (or after invalidate()). */
  fetch(): Observable<SubscriptionSettings> {
    if (!this.settings$) {
      this.settings$ = this.http.get<any>(API_URLS.PAYMENT_PLANS).pipe(
        map(data => ({
          subscriptionEnabled: !!data?.subscriptionEnabled,
          freeTierForAll:      !!data?.freeTierForAll
        })),
        tap(s => { this._settings = s; }),
        catchError(() => {
          // On network error: fail-open (allow access, don't block users)
          this._settings = { subscriptionEnabled: false, freeTierForAll: true };
          return of(this._settings);
        }),
        shareReplay(1)
      );
    }
    return this.settings$;
  }

  /** Call after admin changes subscription settings to force a fresh fetch. */
  invalidate(): void { this.settings$ = null; }
}
