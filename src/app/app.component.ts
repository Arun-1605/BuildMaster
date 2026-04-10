import { Component, OnInit } from '@angular/core';
import { RouterModule, Router } from '@angular/router';
import { NavbarComponent } from './navbar/navbar.component';
import { OllamaSetupComponent } from './ollama-setup/ollama-setup.component';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterModule, NavbarComponent, OllamaSetupComponent, CommonModule],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent implements OnInit {
  constructor(private router: Router) {}

  ngOnInit(): void {
    if (typeof window !== 'undefined' && localStorage.getItem('user')) {
      if (!this.router.url.startsWith('/user-dashboard')) {
        this.router.navigate(['/user-dashboard']);
      }
    }
  }
}