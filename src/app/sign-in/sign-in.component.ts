import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { API_URLS } from '../core/constants';

@Component({
  selector: 'app-sign-in',
  standalone: true,
  imports: [ReactiveFormsModule, FormsModule, CommonModule, RouterModule],
  templateUrl: './sign-in.component.html',
  styleUrls: ['./sign-in.component.css'],
})
export class SignInComponent implements OnInit {
  signInForm: FormGroup;
  submitting   = false;
  errorMsg     = '';
  successMsg   = '';

  // OTP flow state
  otpRequired  = false;  // hidden by default; shown only when backend confirms it is required
  step: 'form' | 'otp' = 'form';
  otpCode      = '';
  otpSent      = false;
  sendingOtp   = false;
  verifyingOtp = false;
  otpError     = '';
  phoneVerified = false;

  // Duplicate check state
  phoneExists = false;
  emailExists = false;

  constructor(
    private fb:     FormBuilder,
    private router: Router,
    private http:   HttpClient
  ) {
    this.signInForm = this.fb.group({
      username: ['', [Validators.required, Validators.maxLength(50)]],
      name:     ['', [Validators.required, Validators.maxLength(100)]],
      password: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(100)]],
      phone:    ['', [Validators.pattern(/^[0-9+\-\s]{7,20}$/)]],
      city:     ['', [Validators.maxLength(100)]],
      email:    ['', [Validators.required, Validators.email, Validators.maxLength(100)]],
    });
  }

  ngOnInit(): void {
    // Check if OTP is required (admin-configurable)
    this.http.get<any>(API_URLS.OTP_CONFIG).subscribe({
      next:  (r) => this.otpRequired = !!r.required,
      error: ()  => this.otpRequired = false  // config unavailable: match admin intent (disabled)
    });
  }

  // ── Check phone uniqueness on blur ──────────────────────────────────────────
  onPhoneBlur(): void {
    const phone = this.signInForm.get('phone')?.value?.trim();
    if (!phone || phone.length < 7) { this.phoneExists = false; return; }

    this.http.get<any>(`${API_URLS.LOGIN.replace('/login', '')}/check-phone?phone=${encodeURIComponent(phone)}`)
      .subscribe({
        next: (r) => this.phoneExists = r.exists,
        error: () => this.phoneExists = false
      });
  }

  // ── Check email uniqueness on blur ──────────────────────────────────────────
  onEmailBlur(): void {
    const email = this.signInForm.get('email')?.value?.trim();
    if (!email) { this.emailExists = false; return; }

    this.http.get<any>(`${API_URLS.LOGIN.replace('/login', '')}/check-email?email=${encodeURIComponent(email)}`)
      .subscribe({
        next: (r) => this.emailExists = r.exists,
        error: () => this.emailExists = false
      });
  }

  // ── Send OTP ────────────────────────────────────────────────────────────────
  sendOtp(): void {
    if (!this.otpRequired) return; // OTP not required
    const phone = this.signInForm.get('phone')?.value?.trim();
    if (!phone) { this.otpError = 'Enter a phone number first.'; return; }
    if (this.phoneExists)  { this.otpError = 'This phone is already registered.'; return; }

    this.sendingOtp = true;
    this.otpError   = '';

    this.http.post<any>(API_URLS.OTP_SEND, { phone }).subscribe({
      next: (r) => {
        this.sendingOtp = false;
        this.otpSent    = true;
        this.step       = 'otp';
        if (r.otp) this.otpCode = r.otp;
      },
      error: () => { this.sendingOtp = false; this.otpError = 'Failed to send OTP. Try again.'; }
    });
  }

  // ── Verify OTP ──────────────────────────────────────────────────────────────
  verifyOtp(): void {
    const phone = this.signInForm.get('phone')?.value?.trim();
    if (!this.otpCode) { this.otpError = 'Enter the OTP.'; return; }

    this.verifyingOtp = true;
    this.otpError     = '';

    this.http.post<any>(API_URLS.OTP_VERIFY, { phone, otp: this.otpCode }).subscribe({
      next: (r) => {
        this.verifyingOtp = false;
        if (r.verified) {
          this.phoneVerified = true;
          this.step          = 'form';
        } else {
          this.otpError = 'OTP verification failed.';
        }
      },
      error: (err) => {
        this.verifyingOtp = false;
        this.otpError = err?.error?.message || 'Invalid OTP.';
      }
    });
  }

  skipOtp(): void {
    this.step          = 'form';
    this.phoneVerified = false;
    this.otpSent       = false;
  }

  // ── Submit registration ─────────────────────────────────────────────────────
  onSignIn(): void {
    if (this.signInForm.invalid)  return;
    if (this.phoneExists)         { this.errorMsg = 'Phone number already registered.'; return; }
    if (this.emailExists)         { this.errorMsg = 'Email already registered.'; return; }

    const phone = this.signInForm.get('phone')?.value?.trim();
    // If OTP is required AND a phone number is provided AND not yet verified → block
    if (this.otpRequired && phone && !this.phoneVerified) {
      this.errorMsg = 'Please verify your phone number with OTP before registering.';
      return;
    }

    this.submitting = true;
    this.errorMsg   = '';

    const payload = {
      id: 0,
      ...this.signInForm.value,
      phoneVerified: this.phoneVerified
    };

    this.http.post<any>(API_URLS.SIGNUP, payload).subscribe({
      next: (res) => {
        this.submitting = false;
        this.successMsg = res?.message || 'Account created! Please log in.';
        setTimeout(() => this.router.navigate(['/login']), 1500);
      },
      error: (err) => {
        this.submitting = false;
        this.errorMsg   = err?.error?.message || 'Sign up failed. Please try again.';
      }
    });
  }
}
