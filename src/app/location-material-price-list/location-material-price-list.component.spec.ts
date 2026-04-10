import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LocationMaterialPriceListComponent } from './location-material-price-list.component';

describe('LocationMaterialPriceListComponent', () => {
  let component: LocationMaterialPriceListComponent;
  let fixture: ComponentFixture<LocationMaterialPriceListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LocationMaterialPriceListComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LocationMaterialPriceListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
