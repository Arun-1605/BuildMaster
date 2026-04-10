import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from '../auth.service';
import { environment } from '../../environments/environment';

const ADMIN_BASE = `${environment.apiBaseUrl}/Admin`;

interface AppSetting { key: string; value: string; updatedAt: string; updatedBy: string; }
interface User {
  id: number; username: string; name: string; email: string; phone: string;
  role: string; isActive: boolean; phoneVerified: boolean;
  subscriptionTier: string; subscriptionExpiry: string | null;
  createdAt: string; lastLoginAt: string | null; failedLoginAttempts: number;
}

@Component({
  selector: 'app-admin-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-panel.component.html',
  styleUrls: ['./admin-panel.component.css'],
})
export class AdminPanelComponent implements OnInit {
  settings: AppSetting[] = [];
  users: User[] = [];
  activeTab: 'settings' | 'users' = 'settings';

  subscriptionEnabled = false;
  freeTierForAll      = true;
  otpRequired         = true;
  loading    = false;
  saveMsg    = '';
  saveError  = '';

  constructor(private http: HttpClient, private auth: AuthService) {}

  ngOnInit(): void {
    this.loadSettings();
    this.loadUsers();
  }

  private headers(): HttpHeaders {
    const token = this.auth.getToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  loadSettings(): void {
    this.loading = true;
    this.http.get<AppSetting[]>(`${ADMIN_BASE}/settings`, { headers: this.headers() }).subscribe({
      next: (data) => {
        this.settings            = data;
        this.subscriptionEnabled = this.getBool('Subscription:Enabled', false);
        this.freeTierForAll      = this.getBool('Subscription:FreeTierForAll', true);
        this.otpRequired         = this.getBool('Otp:Required', true);
        this.loading             = false;
      },
      error: () => { this.loading = false; }
    });
  }

  loadUsers(): void {
    this.http.get<User[]>(`${ADMIN_BASE}/users`, { headers: this.headers() }).subscribe({
      next: (data) => this.users = data,
      error: () => {}
    });
  }

  private getBool(key: string, def: boolean): boolean {
    const s = this.settings.find(x => x.key === key);
    return s ? s.value === 'true' : def;
  }

  toggleSubscription(): void {
    this.saveMsg = ''; this.saveError = '';
    this.http.put(`${ADMIN_BASE}/subscription/toggle`,
      { value: this.subscriptionEnabled }, { headers: this.headers() }).subscribe({
      next: () => { this.saveMsg = 'Subscription setting saved.'; setTimeout(() => this.saveMsg = '', 3000); },
      error: () => { this.saveError = 'Failed to save.'; }
    });
  }

  toggleFreeTier(): void {
    this.saveMsg = ''; this.saveError = '';
    this.http.put(`${ADMIN_BASE}/subscription/free-tier`,
      { value: this.freeTierForAll }, { headers: this.headers() }).subscribe({
      next: () => { this.saveMsg = 'Free tier setting saved.'; setTimeout(() => this.saveMsg = '', 3000); },
      error: () => { this.saveError = 'Failed to save.'; }
    });
  }

  toggleOtp(): void {
    this.saveMsg = ''; this.saveError = '';
    this.http.put(`${ADMIN_BASE}/otp/toggle`,
      { value: this.otpRequired }, { headers: this.headers() }).subscribe({
      next: () => { this.saveMsg = `OTP verification ${this.otpRequired ? 'enabled' : 'disabled'}.`; setTimeout(() => this.saveMsg = '', 3000); },
      error: () => { this.saveError = 'Failed to save OTP setting.'; }
    });
  }

  setUserTier(user: User, tier: string): void {
    this.http.put(`${ADMIN_BASE}/users/${user.id}/tier`,
      { tier, expiresAt: null }, { headers: this.headers() }).subscribe({
      next: () => { user.subscriptionTier = tier; },
      error: () => {}
    });
  }

  setUserRole(user: User, role: string): void {
    this.http.put(`${ADMIN_BASE}/users/${user.id}/role`,
      { role }, { headers: this.headers() }).subscribe({
      next: () => { user.role = role; },
      error: () => {}
    });
  }

  toggleUserActive(user: User): void {
    const newVal = !user.isActive;
    this.http.put(`${ADMIN_BASE}/users/${user.id}/activate`,
      { value: newVal }, { headers: this.headers() }).subscribe({
      next: () => { user.isActive = newVal; },
      error: () => {}
    });
  }

  get activeUsers(): number  { return this.users.filter(u => u.isActive).length; }
  get premiumUsers(): number { return this.users.filter(u => u.subscriptionTier !== 'Free').length; }
}
