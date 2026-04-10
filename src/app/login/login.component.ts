import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { API_URLS } from '../core/constants';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule, RouterModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
})
export class LoginComponent {
  loginForm: FormGroup;
  errorMsg   = '';
  submitting = false;

  constructor(
    private fb:     FormBuilder,
    private router: Router,
    private http:   HttpClient,
    private auth:   AuthService
  ) {
    this.loginForm = this.fb.group({
      username: ['', Validators.required],
      password: ['', Validators.required],
    });
  }

  onLogin(): void {
    if (this.loginForm.invalid) { this.loginForm.markAllAsTouched(); return; }

    this.submitting = true;
    this.errorMsg   = '';

    this.http.post<any>(API_URLS.LOGIN, this.loginForm.value).subscribe({
      next: (res) => {
        this.submitting = false;
        // Store JWT token and user profile via AuthService
        this.auth.setSession(res.token, res.user);
        this.router.navigate(['/user-dashboard']);
      },
      error: (err) => {
        this.submitting = false;
        this.errorMsg = err?.error?.message || 'Login failed. Please check your credentials.';
      }
    });
  }

  navigateToSignIn(): void { this.router.navigate(['/sign-in']); }
}
