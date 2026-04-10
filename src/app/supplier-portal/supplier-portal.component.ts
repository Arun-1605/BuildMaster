import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { API_URLS } from '../core/constants';

@Component({
  selector: 'app-supplier-portal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './supplier-portal.component.html',
  styleUrls: ['./supplier-portal.component.css']
})
export class SupplierPortalComponent implements OnInit {

  // ── View state ──────────────────────────────────────────────────────────────
  view: 'login' | 'enroll' | 'dashboard' = 'login';
  activeTab: 'profile' | 'rfqs' = 'rfqs';
  selectedRfq: any = null;
  showResponseForm = false;

  // ── Loading / error ─────────────────────────────────────────────────────────
  loading = false;
  loginError = '';
  enrollError = '';
  enrollSuccess = '';
  rfqError = '';
  responseSuccess = '';
  responseError = '';

  // ── Login mode toggle ────────────────────────────────────────────────────────
  loginMode: 'password' | 'accessCode' = 'password';

  // ── Session ─────────────────────────────────────────────────────────────────
  supplierToken: string | null = null;
  supplierInfo: any = null;

  // ── Login form ───────────────────────────────────────────────────────────────
  loginForm = { email: '', password: '', accessCode: '' };

  // ── Enrollment form ──────────────────────────────────────────────────────────
  enrollForm = {
    companyName:   '',
    contactPerson: '',
    email:         '',
    phone:         '',
    category:      '',
    address:       '',
    city:          '',
    state:         '',
    country:       'India',
    password:      '',
    confirmPassword: ''
  };

  readonly categories = [
    'Cement', 'Steel/TMT', 'Sand', 'Aggregate', 'Bricks/AAC Blocks',
    'Tiles/Flooring', 'Electrical', 'Plumbing/Sanitary', 'Paint',
    'Glass/Aluminium', 'Hardware/Fasteners', 'Ready Mix Concrete',
    'Roofing', 'Waterproofing', 'Timber/Doors', 'False Ceiling'
  ];

  // ── Dashboard data ───────────────────────────────────────────────────────────
  profile: any = null;
  rfqs: any[] = [];

  // ── Response form ─────────────────────────────────────────────────────────
  responseForm = {
    totalOfferedAmount: null as number | null,
    validUntil: '',
    leadTimeDays: null as number | null,
    deliveryTerms: '',
    paymentTerms: '',
    supplierComments: ''
  };

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.supplierToken = localStorage.getItem('supplierToken');
    const stored = localStorage.getItem('supplierInfo');
    if (this.supplierToken && stored) {
      try {
        this.supplierInfo = JSON.parse(stored);
        this.view = 'dashboard';
        this.loadRFQs();
        this.loadProfile();
      } catch {
        this.logout();
      }
    }
  }

  // ── Auth ─────────────────────────────────────────────────────────────────────

  login(): void {
    this.loginError = '';
    if (!this.loginForm.email) {
      this.loginError = 'Please enter your email.';
      return;
    }
    if (this.loginMode === 'password' && !this.loginForm.password) {
      this.loginError = 'Please enter your password.';
      return;
    }
    if (this.loginMode === 'accessCode' && !this.loginForm.accessCode) {
      this.loginError = 'Please enter your access code.';
      return;
    }

    this.loading = true;
    const payload: any = { email: this.loginForm.email.trim() };
    if (this.loginMode === 'password') {
      payload['password'] = this.loginForm.password;
    } else {
      payload['accessCode'] = this.loginForm.accessCode.trim().toUpperCase();
    }

    this.http.post<any>(API_URLS.SUPPLIER_PORTAL_LOGIN, payload).subscribe({
      next: res => {
        this.supplierToken = res.token;
        this.supplierInfo  = res.supplier;
        localStorage.setItem('supplierToken', res.token);
        localStorage.setItem('supplierInfo', JSON.stringify(res.supplier));
        this.loading = false;
        this.view    = 'dashboard';
        this.loadRFQs();
        this.loadProfile();
      },
      error: err => {
        this.loading = false;
        this.loginError = err.error?.message ?? 'Login failed. Please check your credentials.';
      }
    });
  }

  register(): void {
    this.enrollError   = '';
    this.enrollSuccess = '';

    if (!this.enrollForm.companyName || !this.enrollForm.contactPerson ||
        !this.enrollForm.email || !this.enrollForm.password) {
      this.enrollError = 'Company name, contact person, email, and password are required.';
      return;
    }
    if (this.enrollForm.password.length < 8) {
      this.enrollError = 'Password must be at least 8 characters.';
      return;
    }
    if (this.enrollForm.password !== this.enrollForm.confirmPassword) {
      this.enrollError = 'Passwords do not match.';
      return;
    }

    this.loading = true;
    const payload = {
      companyName:   this.enrollForm.companyName.trim(),
      contactPerson: this.enrollForm.contactPerson.trim(),
      email:         this.enrollForm.email.trim(),
      phone:         this.enrollForm.phone.trim() || null,
      category:      this.enrollForm.category || null,
      address:       this.enrollForm.address.trim() || null,
      city:          this.enrollForm.city.trim() || null,
      state:         this.enrollForm.state.trim() || null,
      country:       this.enrollForm.country || 'India',
      password:      this.enrollForm.password
    };

    this.http.post<any>(API_URLS.SUPPLIER_PORTAL_REGISTER, payload).subscribe({
      next: res => {
        this.loading       = false;
        this.enrollSuccess = res.message;
      },
      error: err => {
        this.loading     = false;
        this.enrollError = err.error?.message ?? 'Registration failed. Please try again.';
      }
    });
  }

  logout(): void {
    localStorage.removeItem('supplierToken');
    localStorage.removeItem('supplierInfo');
    this.supplierToken = null;
    this.supplierInfo  = null;
    this.profile       = null;
    this.rfqs          = [];
    this.selectedRfq   = null;
    this.view          = 'login';
    this.loginForm     = { email: '', password: '', accessCode: '' };
    this.loginMode     = 'password';
  }

  showEnroll(): void {
    this.enrollError   = '';
    this.enrollSuccess = '';
    this.view          = 'enroll';
  }

  showLogin(): void {
    this.loginError = '';
    this.view       = 'login';
  }

  // ── Data loaders ─────────────────────────────────────────────────────────────

  private headers(): HttpHeaders {
    return new HttpHeaders({ Authorization: `Bearer ${this.supplierToken}` });
  }

  loadProfile(): void {
    this.http.get<any>(API_URLS.SUPPLIER_PORTAL_PROFILE, { headers: this.headers() }).subscribe({
      next:  res => this.profile = res,
      error: ()  => {}
    });
  }

  loadRFQs(): void {
    this.rfqError = '';
    this.http.get<any[]>(API_URLS.SUPPLIER_PORTAL_RFQS, { headers: this.headers() }).subscribe({
      next:  res => this.rfqs = res,
      error: ()  => this.rfqError = 'Could not load RFQs. Please try again.'
    });
  }

  openRFQ(rfq: any): void {
    this.selectedRfq     = null;
    this.showResponseForm = false;
    this.responseSuccess = '';
    this.responseError   = '';
    this.resetResponseForm();

    this.http.get<any>(`${API_URLS.SUPPLIER_PORTAL_RFQS}/${rfq.id}`, { headers: this.headers() }).subscribe({
      next:  res => { this.selectedRfq = res; this.activeTab = 'rfqs'; },
      error: ()  => this.rfqError = 'Could not load RFQ details.'
    });
  }

  backToList(): void {
    this.selectedRfq      = null;
    this.showResponseForm  = false;
    this.responseSuccess   = '';
    this.responseError     = '';
  }

  // ── Response submission ───────────────────────────────────────────────────────

  submitResponse(): void {
    this.responseError   = '';
    this.responseSuccess = '';

    if (!this.responseForm.totalOfferedAmount || this.responseForm.totalOfferedAmount <= 0) {
      this.responseError = 'Please enter a valid total offered amount.';
      return;
    }

    this.loading = true;
    const payload = {
      totalOfferedAmount: this.responseForm.totalOfferedAmount,
      validUntil:         this.responseForm.validUntil || null,
      leadTimeDays:       this.responseForm.leadTimeDays,
      deliveryTerms:      this.responseForm.deliveryTerms,
      paymentTerms:       this.responseForm.paymentTerms,
      supplierComments:   this.responseForm.supplierComments
    };

    this.http.post<any>(
      `${API_URLS.SUPPLIER_PORTAL_RFQS}/${this.selectedRfq.id}/respond`,
      payload,
      { headers: this.headers() }
    ).subscribe({
      next: res => {
        this.loading          = false;
        this.responseSuccess  = res.message;
        this.showResponseForm = false;
        this.openRFQ({ id: this.selectedRfq.id });
        this.loadRFQs();
      },
      error: err => {
        this.loading       = false;
        this.responseError = err.error?.message ?? 'Failed to submit response. Please try again.';
      }
    });
  }

  private resetResponseForm(): void {
    this.responseForm = {
      totalOfferedAmount: null,
      validUntil:         '',
      leadTimeDays:       null,
      deliveryTerms:      '',
      paymentTerms:       '',
      supplierComments:   ''
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  statusClass(status: string): string {
    switch (status) {
      case 'Responded': return 'badge-success';
      case 'Selected':  return 'badge-primary';
      case 'Rejected':  return 'badge-danger';
      case 'Sent':      return 'badge-warning';
      case 'Closed':    return 'badge-secondary';
      default:          return 'badge-light';
    }
  }

  formatDate(d: string | null): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  formatCurrency(n: number | null): string {
    if (n == null) return '—';
    return '₹' + n.toLocaleString('en-IN');
  }
}
