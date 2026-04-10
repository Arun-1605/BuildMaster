import { Routes } from '@angular/router';
import { HomeComponent } from './home/home.component';
import { AuthGuard } from './auth.guard';
import { AdminGuard } from './admin.guard';
import { subscriptionGuard } from './subscription.guard';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  {
    path: 'login',
    loadComponent: () => import('./login/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'sign-in',
    loadComponent: () => import('./sign-in/sign-in.component').then(m => m.SignInComponent)
  },
  {
    path: 'forgot-password',
    loadComponent: () => import('./forgot-password/forgot-password.component').then(m => m.ForgotPasswordComponent)
  },
  {
    path: 'reset-password',
    loadComponent: () => import('./forgot-password/forgot-password.component').then(m => m.ForgotPasswordComponent)
  },
  {
    path: 'subscription',
    loadComponent: () => import('./subscription/subscription.component').then(m => m.SubscriptionComponent),
    canActivate: [AuthGuard]
  },
  {
    path: 'user-dashboard',
    loadComponent: () => import('./user-dashboard/user-dashboard.component').then(m => m.UserDashboardComponent),
    canActivate: [AuthGuard, subscriptionGuard]
  },
  {
    path: 'projects',
    loadComponent: () => import('./project-management/project-management.component').then(m => m.ProjectManagementComponent),
    canActivate: [AuthGuard, subscriptionGuard]
  },
  {
    path: 'risk-management',
    loadComponent: () => import('./risk-management/risk-management.component').then(m => m.RiskManagementComponent),
    canActivate: [AuthGuard, subscriptionGuard]
  },
  {
    path: 'cost-estimation',
    loadComponent: () => import('./cost-estimation/cost-estimation.component').then(m => m.CostEstimationComponent),
    canActivate: [AuthGuard, subscriptionGuard]
  },
  {
    path: 'ai-assistant',
    loadComponent: () => import('./ai-assistant/ai-assistant.component').then(m => m.AiAssistantComponent),
    canActivate: [AuthGuard, subscriptionGuard]
  },
  {
    path: 'materials',
    loadComponent: () => import('./materials/materials.component').then(m => m.MaterialsComponent),
    canActivate: [AuthGuard, subscriptionGuard]
  },
  {
    path: 'location-price',
    loadComponent: () => import('./loction-material-price/loction-material-price.component').then(m => m.LoctionMaterialPriceComponent),
    canActivate: [AuthGuard, subscriptionGuard]
  },
  {
    path: 'supplier-master',
    loadComponent: () => import('./supplier-master/supplier-master.component').then(m => m.SupplierMasterComponent),
    canActivate: [AuthGuard, subscriptionGuard]
  },
  {
    path: 'quotation',
    loadComponent: () => import('./quotation/quotation.component').then(m => m.QuotationComponent),
    canActivate: [AuthGuard, subscriptionGuard]
  },
  {
    path: 'floor-plan',
    loadComponent: () => import('./floor-plan-3d/floor-plan-3d.component').then(m => m.FloorPlan3DComponent),
    canActivate: [AuthGuard, subscriptionGuard]
  },
  {
    path: 'material-price-master',
    loadComponent: () => import('./material-price-master/material-price-master.component').then(m => m.MaterialPriceMasterComponent),
    canActivate: [AuthGuard, subscriptionGuard]
  },
  {
    path: 'admin',
    loadComponent: () => import('./admin-panel/admin-panel.component').then(m => m.AdminPanelComponent),
    canActivate: [AdminGuard]
  },
  {
    path: 'supplier-portal',
    loadComponent: () => import('./supplier-portal/supplier-portal.component').then(m => m.SupplierPortalComponent)
  },
  { path: '**', redirectTo: '' }
];
