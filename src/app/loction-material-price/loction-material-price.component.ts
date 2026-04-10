import { Component, OnInit, ElementRef, ViewChild, HostListener } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { API_URLS } from '../core/constants';

interface LocationData {
  countryId: number;
  countryName: string;
  stateId: number;
  stateName: string;
  districtId: number | null;
  districtName: string;
}

interface MaterialData {
  materialId: number;
  materialName: string;
  materialDescription: string;
  productGroupId: number;
  productGroup: string;
}

@Component({
  selector: 'app-loction-material-price',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule],
  templateUrl: './loction-material-price.component.html',
  styleUrls: ['./loction-material-price.component.css'],
})
export class LoctionMaterialPriceComponent implements OnInit {
  @ViewChild('countryInput') countryInput!: ElementRef;
  @ViewChild('stateInput') stateInput!: ElementRef;
  @ViewChild('districtInput') districtInput!: ElementRef;
  @ViewChild('materialInput') materialInput!: ElementRef;

  priceForm: FormGroup;
  locationData: LocationData[] = [];
  countries: { id: number, name: string }[] = [];
  states: { id: number, name: string }[] = [];
  districts: { id: number, name: string }[] = [];
  materials: MaterialData[] = [];

  filteredCountries: { id: number, name: string }[] = [];
  filteredStates: { id: number, name: string }[] = [];
  filteredDistricts: { id: number, name: string }[] = [];
  filteredMaterials: MaterialData[] = [];

  selectedCountryName = '';
  selectedStateName = '';
  selectedDistrictName = '';
  selectedMaterialName = '';

  showCountryDropdown = false;
  showStateDropdown = false;
  showDistrictDropdown = false;
  showMaterialDropdown = false;

  submitSuccess = false;
  submitError = false;

  constructor(private fb: FormBuilder, private http: HttpClient) {
    this.priceForm = this.fb.group({
      country: ['', Validators.required],
      state: ['', Validators.required],
      district: ['', Validators.required],
      material: ['', Validators.required],
      priceDate: ['', Validators.required],
      price: ['', [Validators.required, Validators.min(0)]],
    });
  }

  ngOnInit() {
    this.http.get<LocationData[]>(API_URLS.GETALLLOCATIONS).subscribe(data => {
      this.locationData = data;
      this.countries = Array.from(
        new Map(data.map(item => [item.countryId, { id: item.countryId, name: item.countryName }])).values()
      );
      this.filteredCountries = [...this.countries];
    });

    this.http.get<MaterialData[]>(API_URLS.GETALLMATERIALS).subscribe(data => {
      this.materials = data;
      this.filteredMaterials = [...this.materials];
    });
  }

  @HostListener('document:click', ['$event'])
  handleClickOutside(event: MouseEvent) {
    const clickedElement = event.target as HTMLElement;
    if (this.showCountryDropdown &&
      !this.elementContainsClick(this.countryInput?.nativeElement, clickedElement) &&
      !clickedElement.closest('.vlookup-btn')) {
      this.showCountryDropdown = false;
    }
    if (this.showStateDropdown &&
      !this.elementContainsClick(this.stateInput?.nativeElement, clickedElement) &&
      !clickedElement.closest('.vlookup-btn')) {
      this.showStateDropdown = false;
    }
    if (this.showDistrictDropdown &&
      !this.elementContainsClick(this.districtInput?.nativeElement, clickedElement) &&
      !clickedElement.closest('.vlookup-btn')) {
      this.showDistrictDropdown = false;
    }
    if (this.showMaterialDropdown &&
      !this.elementContainsClick(this.materialInput?.nativeElement, clickedElement) &&
      !clickedElement.closest('.vlookup-btn')) {
      this.showMaterialDropdown = false;
    }
  }

  private elementContainsClick(element: HTMLElement, clickedElement: HTMLElement): boolean {
    return !!element && (element.contains(clickedElement) || clickedElement === element);
  }

  onCountryInput(value: string) {
    this.filteredCountries = this.countries.filter(country =>
      country.name.toLowerCase().includes(value.toLowerCase())
    );
    this.showCountryDropdown = true;
  }

  onStateInput(value: string) {
    this.filteredStates = this.states.filter(state =>
      state.name.toLowerCase().includes(value.toLowerCase())
    );
    this.showStateDropdown = true;
  }

  onDistrictInput(value: string) {
    this.filteredDistricts = this.districts.filter(district =>
      district.name.toLowerCase().includes(value.toLowerCase())
    );
    this.showDistrictDropdown = true;
  }

  onMaterialInput(value: string) {
    this.filteredMaterials = this.materials.filter(material =>
      material.materialName.toLowerCase().includes(value.toLowerCase())
    );
    this.showMaterialDropdown = true;
  }

  openCountryLookup() {
    this.filteredCountries = [...this.countries];
    this.showCountryDropdown = true;
    this.showStateDropdown = false;
    this.showDistrictDropdown = false;
    this.showMaterialDropdown = false;
  }

  openStateLookup() {
    this.filteredStates = [...this.states];
    this.showStateDropdown = true;
    this.showCountryDropdown = false;
    this.showDistrictDropdown = false;
    this.showMaterialDropdown = false;
  }

  openDistrictLookup() {
    this.filteredDistricts = [...this.districts];
    this.showDistrictDropdown = true;
    this.showCountryDropdown = false;
    this.showStateDropdown = false;
    this.showMaterialDropdown = false;
  }

  openMaterialLookup() {
    this.filteredMaterials = [...this.materials];
    this.showMaterialDropdown = true;
    this.showCountryDropdown = false;
    this.showStateDropdown = false;
    this.showDistrictDropdown = false;
  }

  selectCountry(country: { id: number, name: string }) {
    this.selectedCountryName = country.name;
    this.priceForm.patchValue({ country: country.id, state: '', district: '' });
    this.showCountryDropdown = false;

    if (country.id) {
      this.states = Array.from(
        new Map(
          this.locationData
            .filter(item => item.countryId === country.id)
            .map(item => [item.stateId, { id: item.stateId, name: item.stateName }])
        ).values()
      );
      this.filteredStates = [...this.states];
    }
    this.selectedStateName = '';
    this.selectedDistrictName = '';
    this.districts = [];
    this.filteredDistricts = [];
  }

  selectState(state: { id: number, name: string }) {
    this.selectedStateName = state.name;
    this.priceForm.patchValue({ state: state.id, district: '' });
    this.showStateDropdown = false;

    if (state.id) {
      this.districts = Array.from(
        new Map(
          this.locationData
            .filter(item => item.stateId === state.id && item.districtId !== null)
            .map(item => [item.districtId, { id: item.districtId as number, name: item.districtName }])
        ).values()
      );
      this.filteredDistricts = [...this.districts];
    }
    this.selectedDistrictName = '';
  }

  selectDistrict(district: { id: number, name: string }) {
    this.selectedDistrictName = district.name;
    this.priceForm.patchValue({ district: district.id });
    this.showDistrictDropdown = false;
  }

  selectMaterial(material: MaterialData) {
    this.selectedMaterialName = material.materialName;
    this.priceForm.patchValue({ material: material.materialId });
    this.showMaterialDropdown = false;
  }

  onSubmit() {
    if (this.priceForm.valid) {
      const formValue = this.priceForm.value;
      const requestBody = {
        materialId: Number(formValue.material),
        districtId: Number(formValue.district),
        countryId: Number(formValue.country),
        stateId: Number(formValue.state),
        price: Number(formValue.price),
        pricedate: formValue.priceDate ? new Date(formValue.priceDate).toISOString().split('T')[0] + 'T00:00:00' : null
      };

      this.http.post(API_URLS.SAVEMATERIALPRICE, requestBody).subscribe({
        next: () => {
          alert('Material price saved!');
          this.priceForm.reset();
          this.selectedCountryName = '';
          this.selectedStateName = '';
          this.selectedDistrictName = '';
          this.selectedMaterialName = '';
        },
        error: () => alert('Failed to save material price.')
      });
    }
  }

  hasError(controlName: string, errorName: string): boolean {
    const control = this.priceForm.get(controlName);
    return !!(control && control.touched && control.hasError(errorName));
  }
}