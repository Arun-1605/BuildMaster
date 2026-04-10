import {
  Component, OnInit, ElementRef, ViewChild, HostListener
} from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
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

interface MaterialPriceRow {
  id: number;
  materialId: number;
  materialName: string;
  districtName: string;
  country: string;
  stateName: string;
  price: number;
  unit: string;
  pricedate: string;
}

@Component({
  selector: 'app-material-price-master',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './material-price-master.component.html',
  styleUrls: ['./material-price-master.component.css']
})
export class MaterialPriceMasterComponent implements OnInit {

  /* ─── data ─────────────────────────────────────────── */
  rows: MaterialPriceRow[] = [];
  filteredRows: MaterialPriceRow[] = [];
  locationData: LocationData[] = [];

  countries: { id: number; name: string }[] = [];
  states:    { id: number; name: string }[] = [];
  districts: { id: number; name: string }[] = [];
  materials: MaterialData[] = [];

  /* ─── lookup dropdown state ─────────────────────────── */
  filteredCountries: { id: number; name: string }[] = [];
  filteredStates:    { id: number; name: string }[] = [];
  filteredDistricts: { id: number; name: string }[] = [];
  filteredMaterials: MaterialData[] = [];

  selectedCountryName  = '';
  selectedStateName    = '';
  selectedDistrictName = '';
  selectedMaterialName = '';

  showCountryDd  = false;
  showStateDd    = false;
  showDistrictDd = false;
  showMaterialDd = false;

  /* ─── modal ─────────────────────────────────────────── */
  showModal  = false;
  editId: number | null = null;
  form!: FormGroup;
  saving = false;
  saveError = '';

  /* ─── delete confirm ────────────────────────────────── */
  deleteTarget: MaterialPriceRow | null = null;
  showDeleteModal = false;

  /* ─── list state ────────────────────────────────────── */
  loading  = true;
  loadError = false;
  searchTerm   = '';
  sortCol      = 'pricedate';
  sortDir: 'asc' | 'desc' = 'desc';
  currentPage  = 1;
  pageSize     = 10;
  totalPages   = 1;

  @ViewChild('materialRef') materialRef!: ElementRef;
  @ViewChild('countryRef')  countryRef!:  ElementRef;
  @ViewChild('stateRef')    stateRef!:    ElementRef;
  @ViewChild('districtRef') districtRef!: ElementRef;

  constructor(private fb: FormBuilder, private http: HttpClient) {}

  ngOnInit() {
    this.buildForm();
    this.loadMeta();
    this.loadRows();
  }

  /* ─── form ──────────────────────────────────────────── */
  private buildForm() {
    this.form = this.fb.group({
      material:  ['', Validators.required],
      country:   ['', Validators.required],
      state:     ['', Validators.required],
      district:  ['', Validators.required],
      price:     ['', [Validators.required, Validators.min(0.01)]],
      unit:      ['per bag', Validators.required],
      priceDate: ['', Validators.required]
    });
  }

  /* ─── load reference data ───────────────────────────── */
  private loadMeta() {
    this.http.get<LocationData[]>(API_URLS.GETALLLOCATIONS).subscribe(data => {
      this.locationData = data;
      this.countries = Array.from(
        new Map(data.map(d => [d.countryId, { id: d.countryId, name: d.countryName }])).values()
      );
      this.filteredCountries = [...this.countries];
    });

    this.http.get<MaterialData[]>(API_URLS.GETALLMATERIALS).subscribe(data => {
      this.materials = data;
      this.filteredMaterials = [...this.materials];
    });
  }

  /* ─── load list ─────────────────────────────────────── */
  loadRows() {
    this.loading = true;
    this.loadError = false;
    this.http.get<MaterialPriceRow[]>(API_URLS.GETALLMATERIALPRICE).subscribe({
      next: data => { this.rows = data; this.applyFilters(); this.loading = false; },
      error: () => { this.loading = false; this.loadError = true; }
    });
  }

  /* ─── filter / sort / paginate ──────────────────────── */
  filterItems() { this.currentPage = 1; this.applyFilters(); }

  applyFilters() {
    let data = [...this.rows];
    if (this.searchTerm) {
      const t = this.searchTerm.toLowerCase();
      data = data.filter(r =>
        r.materialName?.toLowerCase().includes(t) ||
        r.country?.toLowerCase().includes(t) ||
        r.stateName?.toLowerCase().includes(t) ||
        r.districtName?.toLowerCase().includes(t) ||
        r.price?.toString().includes(t)
      );
    }
    data.sort((a, b) => {
      let av: any, bv: any;
      switch (this.sortCol) {
        case 'materialName': av = a.materialName; bv = b.materialName; break;
        case 'country':      av = a.country;      bv = b.country;      break;
        case 'stateName':    av = a.stateName;    bv = b.stateName;    break;
        case 'districtName': av = a.districtName; bv = b.districtName; break;
        case 'price':        av = a.price;        bv = b.price;        break;
        case 'pricedate':    av = new Date(a.pricedate).getTime(); bv = new Date(b.pricedate).getTime(); break;
        default:             av = a.pricedate;    bv = b.pricedate;
      }
      if (av === bv) return 0;
      const r = av > bv ? 1 : -1;
      return this.sortDir === 'asc' ? r : -r;
    });
    this.totalPages = Math.max(1, Math.ceil(data.length / this.pageSize));
    const start = (this.currentPage - 1) * this.pageSize;
    this.filteredRows = data.slice(start, start + this.pageSize);
  }

  sort(col: string) {
    this.sortDir = this.sortCol === col ? (this.sortDir === 'asc' ? 'desc' : 'asc') : 'asc';
    this.sortCol = col;
    this.applyFilters();
  }

  sortIcon(col: string): string {
    if (this.sortCol !== col) return '↕';
    return this.sortDir === 'asc' ? '↑' : '↓';
  }

  goToPage(p: number) { if (p >= 1 && p <= this.totalPages) { this.currentPage = p; this.applyFilters(); } }

  pageNumbers(): number[] {
    const pages: number[] = [];
    if (this.totalPages <= 7) { for (let i = 1; i <= this.totalPages; i++) pages.push(i); return pages; }
    pages.push(1);
    const s = Math.max(2, this.currentPage - 1);
    const e = Math.min(this.totalPages - 1, this.currentPage + 1);
    if (s > 2) pages.push(-1);
    for (let i = s; i <= e; i++) pages.push(i);
    if (e < this.totalPages - 1) pages.push(-1);
    pages.push(this.totalPages);
    return pages;
  }

  /* ─── modal open / close ────────────────────────────── */
  openAdd() {
    this.editId = null;
    this.form.reset({ unit: 'per bag' });
    this.clearSelections();
    this.saveError = '';
    this.showModal = true;
  }

  openEdit(row: MaterialPriceRow) {
    this.editId = row.id;
    this.saveError = '';
    this.selectedMaterialName = row.materialName;
    this.selectedCountryName  = row.country;
    this.selectedStateName    = row.stateName;
    this.selectedDistrictName = row.districtName;

    // rebuild state & district lists for the selected country/state
    const matchedCountry = this.countries.find(c => c.name === row.country);
    const cId = matchedCountry?.id ?? 0;
    this.states = Array.from(
      new Map(
        this.locationData
          .filter(d => d.countryId === cId)
          .map(d => [d.stateId, { id: d.stateId, name: d.stateName }])
      ).values()
    );
    const matchedState = this.states.find(s => s.name === row.stateName);
    const sId = matchedState?.id ?? 0;
    this.districts = Array.from(
      new Map(
        this.locationData
          .filter(d => d.stateId === sId && d.districtId !== null)
          .map(d => [d.districtId, { id: d.districtId as number, name: d.districtName }])
      ).values()
    );
    const matchedDistrict = this.districts.find(d => d.name === row.districtName);
    const matchedMaterial = this.materials.find(m => m.materialName === row.materialName);

    this.form.patchValue({
      material:  matchedMaterial?.materialId ?? '',
      country:   cId || '',
      state:     sId || '',
      district:  matchedDistrict?.id ?? '',
      price:     row.price,
      unit:      row.unit || 'per bag',
      priceDate: row.pricedate ? new Date(row.pricedate).toISOString().split('T')[0] : ''
    });
    this.showModal = true;
  }

  closeModal() { this.showModal = false; }

  /* ─── save ──────────────────────────────────────────── */
  save() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const v = this.form.value;
    const body = {
      materialId: Number(v.material),
      countryId:  Number(v.country),
      stateId:    Number(v.state),
      districtId: Number(v.district),
      price:      Number(v.price),
      unit:       v.unit,
      pricedate:  new Date(v.priceDate).toISOString().split('T')[0] + 'T00:00:00'
    };
    this.saving = true;
    this.saveError = '';

    const req = this.editId
      ? this.http.put(`${API_URLS.UPDATEMATERIALPRICE}/${this.editId}`, body)
      : this.http.post(API_URLS.SAVEMATERIALPRICE, body);

    req.subscribe({
      next: () => { this.saving = false; this.showModal = false; this.loadRows(); },
      error: () => { this.saving = false; this.saveError = 'Failed to save. Please try again.'; }
    });
  }

  /* ─── delete ────────────────────────────────────────── */
  askDelete(row: MaterialPriceRow) { this.deleteTarget = row; this.showDeleteModal = true; }
  cancelDelete()   { this.deleteTarget = null; this.showDeleteModal = false; }

  confirmDelete() {
    if (!this.deleteTarget) return;
    this.http.delete(`${API_URLS.DELETELOCATIONMATERIALPRICE}/${this.deleteTarget.id}`).subscribe({
      next: () => {
        this.rows = this.rows.filter(r => r.id !== this.deleteTarget!.id);
        this.applyFilters();
        this.showDeleteModal = false;
        this.deleteTarget = null;
      },
      error: () => alert('Failed to delete record.')
    });
  }

  /* ─── autocomplete helpers ──────────────────────────── */
  onMaterialInput(v: string) {
    this.filteredMaterials = this.materials.filter(m => m.materialName.toLowerCase().includes(v.toLowerCase()));
    this.showMaterialDd = true;
  }
  openMaterialDd() { this.filteredMaterials = [...this.materials]; this.closeAllDd(); this.showMaterialDd = true; }
  selectMaterial(m: MaterialData) {
    this.selectedMaterialName = m.materialName;
    this.form.patchValue({ material: m.materialId });
    this.showMaterialDd = false;
  }

  onCountryInput(v: string) {
    this.filteredCountries = this.countries.filter(c => c.name.toLowerCase().includes(v.toLowerCase()));
    this.showCountryDd = true;
  }
  openCountryDd() { this.filteredCountries = [...this.countries]; this.closeAllDd(); this.showCountryDd = true; }
  selectCountry(c: { id: number; name: string }) {
    this.selectedCountryName = c.name;
    this.form.patchValue({ country: c.id, state: '', district: '' });
    this.selectedStateName = ''; this.selectedDistrictName = '';
    this.states = Array.from(new Map(
      this.locationData.filter(d => d.countryId === c.id)
        .map(d => [d.stateId, { id: d.stateId, name: d.stateName }])
    ).values());
    this.filteredStates = [...this.states];
    this.districts = []; this.filteredDistricts = [];
    this.showCountryDd = false;
  }

  onStateInput(v: string) {
    this.filteredStates = this.states.filter(s => s.name.toLowerCase().includes(v.toLowerCase()));
    this.showStateDd = true;
  }
  openStateDd() { this.filteredStates = [...this.states]; this.closeAllDd(); this.showStateDd = true; }
  selectState(s: { id: number; name: string }) {
    this.selectedStateName = s.name;
    this.form.patchValue({ state: s.id, district: '' });
    this.selectedDistrictName = '';
    this.districts = Array.from(new Map(
      this.locationData.filter(d => d.stateId === s.id && d.districtId !== null)
        .map(d => [d.districtId, { id: d.districtId as number, name: d.districtName }])
    ).values());
    this.filteredDistricts = [...this.districts];
    this.showStateDd = false;
  }

  onDistrictInput(v: string) {
    this.filteredDistricts = this.districts.filter(d => d.name.toLowerCase().includes(v.toLowerCase()));
    this.showDistrictDd = true;
  }
  openDistrictDd() { this.filteredDistricts = [...this.districts]; this.closeAllDd(); this.showDistrictDd = true; }
  selectDistrict(d: { id: number; name: string }) {
    this.selectedDistrictName = d.name;
    this.form.patchValue({ district: d.id });
    this.showDistrictDd = false;
  }

  private closeAllDd() {
    this.showMaterialDd = false; this.showCountryDd = false;
    this.showStateDd = false;    this.showDistrictDd = false;
  }

  private clearSelections() {
    this.selectedMaterialName = ''; this.selectedCountryName  = '';
    this.selectedStateName    = ''; this.selectedDistrictName = '';
    this.states = []; this.districts = [];
    this.filteredStates = []; this.filteredDistricts = [];
  }

  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent) {
    const el = e.target as HTMLElement;
    if (!el.closest('.lookup-field')) this.closeAllDd();
  }

  /* ─── template helpers ──────────────────────────────── */
  err(field: string) {
    const c = this.form.get(field);
    return c && c.touched && c.invalid;
  }

  fmtDate(d: string) {
    return d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
  }
}
