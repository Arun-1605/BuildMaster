import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { API_URLS } from '../core/constants';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './forgot-password.component.html',
  styleUrls: ['./forgot-password.component.css']
})
export class ForgotPasswordComponent {
  // Forgot flow
  email       = '';
  // Reset flow (when token is in URL)
  token       = '';
  newPassword = '';
  confirmPassword = '';

  mode: 'forgot' | 'reset' = 'forgot';
  loading  = false;
  success  = '';
  error    = '';

  constructor(private http: HttpClient, private route: ActivatedRoute) {
    // If ?token=... in URL, switch to reset mode
    this.route.queryParams.subscribe(params => {
      if (params['token']) {
        this.token = params['token'];
        this.mode  = 'reset';
      }
    });
  }

  submitForgot() {
    if (!this.email.trim()) { this.error = 'Please enter your email.'; return; }
    this.loading = true; this.error = '';
    this.http.post<any>(API_URLS.FORGOT_PASSWORD, { email: this.email }).subscribe({
      next: (res) => { this.success = res.message; this.loading = false; },
      error: (err) => { this.error = err.error?.message ?? 'Something went wrong.'; this.loading = false; }
    });
  }

  submitReset() {
    if (!this.newPassword) { this.error = 'Please enter a new password.'; return; }
    if (this.newPassword.length < 6) { this.error = 'Password must be at least 6 characters.'; return; }
    if (this.newPassword !== this.confirmPassword) { this.error = 'Passwords do not match.'; return; }
    this.loading = true; this.error = '';
    this.http.post<any>(API_URLS.RESET_PASSWORD, { token: this.token, newPassword: this.newPassword }).subscribe({
      next: (res) => { this.success = res.message + ' Redirecting to login…'; this.loading = false; setTimeout(() => window.location.href = '/login', 2500); },
      error: (err) => { this.error = err.error?.message ?? 'Reset failed. The link may have expired.'; this.loading = false; }
    });
  }
}
