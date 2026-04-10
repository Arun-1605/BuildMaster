import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LoctionMaterialPriceComponent } from './loction-material-price.component';

describe('LoctionMaterialPriceComponent', () => {
  let component: LoctionMaterialPriceComponent;
  let fixture: ComponentFixture<LoctionMaterialPriceComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoctionMaterialPriceComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LoctionMaterialPriceComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
