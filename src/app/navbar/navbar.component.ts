import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { ContactFormComponent } from '../contact-form/contact-form.component';
import { AuthService } from '../auth.service';
import { API_URLS } from '../core/constants';

@Component({
  selector: 'app-navbar',
  standalone: true,
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.css'],
  imports: [ContactFormComponent, CommonModule, RouterModule],
})
export class NavbarComponent implements OnInit, OnDestroy {
  isMobileMenuOpen = false;
  showContactForm  = false;
  subscriptionEnabled = false;

  // Notifications
  unreadCount   = 0;
  showBellMenu  = false;
  notifications: { id: number; title: string; message: string; type: string; isRead: boolean; linkUrl?: string; createdAt: string }[] = [];
  notifLoading  = false;

  private pollInterval: any;

  constructor(private router: Router, private authService: AuthService, private http: HttpClient) {}

  get isLoggedIn(): boolean  { return this.authService.isAuthenticated(); }
  get isOwner(): boolean     { return this.authService.isOwner(); }
  get isPremium(): boolean   { return this.subscriptionEnabled && this.authService.isPremium(); }
  get subscriptionTier(): string { return this.authService.getSubscriptionTier(); }

  ngOnInit(): void {
    if (this.isLoggedIn) {
      this.fetchUnreadCount();
      this.pollInterval = setInterval(() => {
        if (this.isLoggedIn) this.fetchUnreadCount();
      }, 30000);
    }
    // Fetch subscription settings
    this.http.get<any>(API_URLS.PAYMENT_PLANS).subscribe({
      next: (data) => this.subscriptionEnabled = data.subscriptionEnabled,
      error: () => this.subscriptionEnabled = false
    });
  }

  ngOnDestroy(): void {
    if (this.pollInterval) clearInterval(this.pollInterval);
  }

  fetchUnreadCount(): void {
    this.http.get<{ count: number }>(API_URLS.NOTIFICATIONS_UNREAD).subscribe({
      next: res => this.unreadCount = res.count,
      error: ()  => {}
    });
  }

  toggleBell(): void {
    this.showBellMenu = !this.showBellMenu;
    if (this.showBellMenu) this.loadNotifications();
  }

  loadNotifications(): void {
    this.notifLoading = true;
    this.http.get<any[]>(API_URLS.NOTIFICATIONS).subscribe({
      next: data => { this.notifications = data; this.notifLoading = false; },
      error: ()  => { this.notifLoading = false; }
    });
  }

  markAllRead(): void {
    this.http.patch(API_URLS.NOTIFICATIONS_MARK_READ, {}).subscribe({
      next: () => {
        this.unreadCount = 0;
        this.notifications = this.notifications.map(n => ({ ...n, isRead: true }));
      }
    });
  }

  markOneRead(n: any): void {
    if (n.isRead) return;
    this.http.patch(`${API_URLS.NOTIFICATIONS}/${n.id}/read`, {}).subscribe({
      next: () => {
        n.isRead = true;
        this.unreadCount = Math.max(0, this.unreadCount - 1);
      }
    });
  }

  goNotif(n: any): void {
    this.markOneRead(n);
    if (n.linkUrl) this.router.navigateByUrl(n.linkUrl);
    this.showBellMenu = false;
  }

  notifIcon(type: string): string {
    const map: Record<string, string> = { rfq: '📨', success: '✅', warning: '⚠️', risk: '🔴', info: 'ℹ️' };
    return map[type] ?? 'ℹ️';
  }

  toggleMobileMenu(): void { this.isMobileMenuOpen = !this.isMobileMenuOpen; }
  closeMobileMenu(): void { this.isMobileMenuOpen = false; }
  openContactForm(): void  { this.showContactForm = true; }
  closeContactForm(): void { this.showContactForm = false; }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/']);
  }
}
