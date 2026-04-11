import { Component, OnInit } from '@angular/core';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { NavbarComponent } from './navbar/navbar.component';
import { OllamaSetupComponent } from './ollama-setup/ollama-setup.component';
import { CommonModule } from '@angular/common';
import { ToastComponent } from './core/toast.component';
import { filter, take } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterModule, NavbarComponent, OllamaSetupComponent, CommonModule, ToastComponent],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent implements OnInit {
  constructor(private router: Router) {}

  ngOnInit(): void {
    if (typeof window === 'undefined') return;
    // Only auto-redirect logged-in users who land on the root path ("/").
    // Do NOT redirect when the user navigates directly to /subscription or any
    // other deep link — that was causing 404-like experiences.
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      take(1)
    ).subscribe((e: any) => {
      if ((e.urlAfterRedirects === '/' || e.urlAfterRedirects === '') && localStorage.getItem('user')) {
        this.router.navigate(['/user-dashboard']);
      }
    });
  }
}