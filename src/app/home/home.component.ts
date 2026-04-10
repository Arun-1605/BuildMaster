import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css'],
})
export class HomeComponent {
  constructor(private router: Router, private authService: AuthService) {}

  navigateToDashboard(): void {
    if (this.authService.isAuthenticated()) {
      this.router.navigate(['/projects']);
    } else {
      this.router.navigate(['/login']);
    }
  }
}
