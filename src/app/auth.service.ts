import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class AuthService {

  private readonly USER_KEY  = 'user';
  private readonly TOKEN_KEY = 'token';

  // ── Session management ──────────────────────────────────────────────────────

  setSession(token: string, user: any): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(this.TOKEN_KEY, token);
    localStorage.setItem(this.USER_KEY, JSON.stringify(user));
  }

  getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(this.TOKEN_KEY);
  }

  logout(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(this.USER_KEY);
    localStorage.removeItem(this.TOKEN_KEY);
  }

  // ── Auth state ──────────────────────────────────────────────────────────────

  isAuthenticated(): boolean {
    if (typeof window === 'undefined') return false;
    return !!localStorage.getItem(this.USER_KEY);
  }

  getCurrentUser(): any {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem(this.USER_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  // ── Role helpers ────────────────────────────────────────────────────────────

  getRole(): string {
    const user = this.getCurrentUser();
    return user?.role ?? user?.Role ?? 'User';
  }

  isOwner(): boolean { return this.getRole() === 'Owner'; }

  isAdminOrOwner(): boolean {
    const r = this.getRole();
    return r === 'Owner' || r === 'Admin';
  }

  // ── Subscription ────────────────────────────────────────────────────────────

  getSubscriptionTier(): string {
    const user = this.getCurrentUser();
    return user?.subscriptionTier ?? user?.SubscriptionTier ?? 'Free';
  }

  isPremium(): boolean { return this.getSubscriptionTier() !== 'Free'; }

  // ── Phone verification ──────────────────────────────────────────────────────

  isPhoneVerified(): boolean {
    const user = this.getCurrentUser();
    return user?.phoneVerified === true || user?.phoneVerified === 'true';
  }

  // Legacy no-op kept so existing callers don't break
  login(): void {}
}
