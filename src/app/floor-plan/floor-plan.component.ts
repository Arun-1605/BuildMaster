import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-floor-plan',
  standalone: true,
  imports: [],
  template: `<ng-container></ng-container>`
})
export class FloorPlanComponent {
  constructor(router: Router) {
    router.navigate(['/floor-plan'], { replaceUrl: true });
  }
}
