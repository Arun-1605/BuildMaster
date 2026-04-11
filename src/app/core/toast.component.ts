import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService, Toast } from './toast.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="toast-container" aria-live="polite" aria-atomic="false">
      <div
        *ngFor="let toast of toastSvc.toasts(); trackBy: trackById"
        class="toast toast-{{ toast.type }}"
        role="alert"
        (click)="toastSvc.dismiss(toast.id)"
      >
        <span class="toast-icon">{{ icon(toast.type) }}</span>
        <span class="toast-msg">{{ toast.message }}</span>
        <button
          class="toast-close"
          aria-label="Dismiss"
          (click)="toastSvc.dismiss(toast.id); $event.stopPropagation()"
        >&times;</button>
      </div>
    </div>
  `,
  styles: [`
    .toast-container {
      position: fixed;
      top: 1.25rem;
      right: 1.25rem;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
      max-width: 400px;
      width: calc(100vw - 2.5rem);
      pointer-events: none;
    }
    .toast {
      display: flex;
      align-items: flex-start;
      gap: 0.7rem;
      padding: 0.85rem 1rem;
      border-radius: 10px;
      box-shadow: 0 6px 24px rgba(0,0,0,0.35);
      animation: toast-in 0.25s ease;
      cursor: pointer;
      font-size: 0.875rem;
      line-height: 1.45;
      pointer-events: all;
    }
    @keyframes toast-in {
      from { transform: translateX(110%); opacity: 0; }
      to   { transform: translateX(0);    opacity: 1; }
    }
    .toast-success { background: #14532d; border-left: 4px solid #22c55e; color: #bbf7d0; }
    .toast-error   { background: #450a0a; border-left: 4px solid #ef4444; color: #fecaca; }
    .toast-warning { background: #451a03; border-left: 4px solid #f59e0b; color: #fde68a; }
    .toast-info    { background: #1e3a5f; border-left: 4px solid #3b82f6; color: #bfdbfe; }
    .toast-icon { font-size: 1.1rem; flex-shrink: 0; margin-top: 1px; }
    .toast-msg  { flex: 1; }
    .toast-close {
      background: none;
      border: none;
      cursor: pointer;
      opacity: 0.65;
      font-size: 1.2rem;
      padding: 0;
      color: inherit;
      line-height: 1;
      flex-shrink: 0;
      margin-top: -1px;
    }
    .toast-close:hover { opacity: 1; }
    @media (max-width: 480px) {
      .toast-container {
        top: auto;
        bottom: 1rem;
        right: 0.75rem;
        left: 0.75rem;
        width: auto;
      }
    }
  `]
})
export class ToastComponent {
  toastSvc = inject(ToastService);

  trackById(_: number, t: Toast): number { return t.id; }

  icon(type: string): string {
    const map: Record<string, string> = {
      success: '✅',
      error:   '❌',
      warning: '⚠️',
      info:    'ℹ️'
    };
    return map[type] ?? 'ℹ️';
  }
}
