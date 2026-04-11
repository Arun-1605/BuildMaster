import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { API_URLS } from '../core/constants';
import { AuthService } from '../auth.service';
import { environment } from '../../environments/environment';

declare var Razorpay: any;

interface Plan {
  id: string;
  name: string;
  price: number;
  currency: string;
  amountPaise: number;
  duration: string;
  features: string[];
}

@Component({
  selector: 'app-subscription',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './subscription.component.html',
  styleUrls: ['./subscription.component.css']
})
export class SubscriptionComponent implements OnInit {
  plans: Plan[]     = [];
  loading           = true;
  paying            = false;
  selectedPlanId    = 'monthly';
  error             = '';
  success           = '';
  currentTier       = 'Free';
  subscriptionExpiry: string | null = null;

  constructor(
    private http: HttpClient,
    private auth: AuthService,
    private router: Router
  ) {}

  ngOnInit() {
    const user = this.auth.getCurrentUser();
    this.currentTier       = user?.subscriptionTier ?? 'Free';
    this.subscriptionExpiry = user?.subscriptionExpiry ?? null;
    this.loadPlans();
  }

  loadPlans() {
    this.http.get<any>(API_URLS.PAYMENT_PLANS).subscribe({
      next: (data) => {
        this.plans   = data.plans;
        this.loading = false;
      },
      error: () => {
        this.error   = 'Failed to load plans. Please refresh.';
        this.loading = false;
      }
    });
  }

  selectPlan(planId: string) { this.selectedPlanId = planId; }

  subscribe() {
    const plan = this.plans.find(p => p.id === this.selectedPlanId);
    if (!plan) return;

    if (!environment.razorpayKeyId) {
      this.error = 'Payment gateway is not configured. Please contact support.';
      return;
    }

    this.paying = true;
    this.error  = '';

    this.http.post<any>(API_URLS.PAYMENT_CREATE_ORDER, { planId: plan.id }).subscribe({
      next: (order) => this.openRazorpay(order, plan),
      error: (err) => {
        this.error  = err.error?.message ?? 'Failed to initiate payment. Please try again.';
        this.paying = false;
      }
    });
  }

  private openRazorpay(order: any, plan: Plan) {
    const user = this.auth.getCurrentUser();
    const self = this;

    const options = {
      key:         environment.razorpayKeyId,
      amount:      order.amountPaise,
      currency:    'INR',
      name:        'BuildMaster CMS',
      description: plan.name,
      image:       '',
      order_id:    order.orderId,
      prefill: {
        name:  user?.name  ?? '',
        email: user?.email ?? '',
        contact: user?.phone ?? ''
      },
      theme: { color: '#f7c948' },
      handler: (response: any) => {
        self.verifyPayment(response, plan.id);
      },
      modal: {
        ondismiss: () => { self.paying = false; }
      }
    };

    const rzp = new Razorpay(options);
    rzp.on('payment.failed', (res: any) => {
      self.error  = `Payment failed: ${res.error.description}`;
      self.paying = false;
    });
    rzp.open();
  }

  private verifyPayment(rzpResponse: any, planId: string) {
    const payload = {
      razorpayOrderId:   rzpResponse.razorpay_order_id,
      razorpayPaymentId: rzpResponse.razorpay_payment_id,
      razorpaySignature: rzpResponse.razorpay_signature,
      planId
    };

    this.http.post<any>(API_URLS.PAYMENT_VERIFY, payload).subscribe({
      next: (res) => {
        this.paying  = false;
        this.success = res.message;
        this.currentTier = 'Premium';

        // Store the fresh JWT (has updated subscriptionTier=Premium claim).
        // Without this, the old token still says "Free" and the backend middleware
        // would keep returning 402 until the user logs out and back in.
        const user = this.auth.getCurrentUser();
        if (user) {
          user.subscriptionTier   = 'Premium';
          user.subscriptionExpiry = res.expiry;
          this.auth.setSession(res.newToken, user);
        }

        setTimeout(() => this.router.navigate(['/user-dashboard']), 2500);
      },
      error: (err) => {
        this.error  = err.error?.message ?? 'Payment verification failed. Contact support.';
        this.paying = false;
      }
    });
  }

  get isPremium(): boolean { return this.currentTier !== 'Free'; }

  getSelectedPlanName(): string {
    return this.plans.find(p => p.id === this.selectedPlanId)?.name ?? '';
  }
}
