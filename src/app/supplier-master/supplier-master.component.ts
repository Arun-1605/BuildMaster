import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Supplier, CreateSupplierDto, SupplierService } from '../service/supplier.service';

@Component({
  selector: 'app-supplier-master',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './supplier-master.component.html',
  styleUrls: ['./supplier-master.component.css']
})
export class SupplierMasterComponent implements OnInit {
  suppliers: Supplier[] = [];
  filtered: Supplier[] = [];
  categories: string[] = [];

  filterText   = '';
  filterCat    = '';
  filterActive = '';

  showForm   = false;
  editMode   = false;
  editId     = 0;
  submitting = false;
  loading    = true;
  error      = '';
  success    = '';

  ratingModal: { show: boolean; supplier: Supplier | null; value: number } =
    { show: false, supplier: null, value: 5 };

  form: FormGroup;

  indiaStates = [
    'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh',
    'Goa','Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka',
    'Kerala','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram',
    'Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana',
    'Tripura','Uttar Pradesh','Uttarakhand','West Bengal',
    'Andaman and Nicobar Islands','Chandigarh','Dadra and Nagar Haveli','Daman and Diu',
    'Delhi','Jammu and Kashmir','Ladakh','Lakshadweep','Puducherry'
  ];

  constructor(private svc: SupplierService, private fb: FormBuilder) {
    this.form = this.fb.group({
      companyName:   ['', [Validators.required, Validators.minLength(2)]],
      contactPerson: [''],
      category:      ['', Validators.required],
      email:         ['', Validators.email],
      whatsAppNumber:[''],
      phone:         [''],
      address:       [''],
      city:          [''],
      state:         [''],
      country:       ['India'],
      gstNumber:     [''],
      pan:           [''],
      bankName:      [''],
      accountNumber: [''],
      ifsc:          [''],
      notes:         [''],
      isActive:      [true]
    });
  }

  ngOnInit() {
    this.loadCategories();
    this.loadSuppliers();
  }

  loadCategories() {
    this.svc.getCategories().subscribe({ next: c => this.categories = c });
  }

  loadSuppliers() {
    this.loading = true;
    this.svc.getAll().subscribe({
      next: data => { this.suppliers = data; this.applyFilter(); this.loading = false; },
      error: () => { this.error = 'Failed to load suppliers.'; this.loading = false; }
    });
  }

  applyFilter() {
    let data = [...this.suppliers];
    if (this.filterText)
      data = data.filter(s =>
        s.companyName.toLowerCase().includes(this.filterText.toLowerCase()) ||
        s.contactPerson.toLowerCase().includes(this.filterText.toLowerCase()) ||
        s.city.toLowerCase().includes(this.filterText.toLowerCase())
      );
    if (this.filterCat)
      data = data.filter(s => s.category === this.filterCat);
    if (this.filterActive === 'true')  data = data.filter(s =>  s.isActive);
    if (this.filterActive === 'false') data = data.filter(s => !s.isActive);
    this.filtered = data;
  }

  openCreate() {
    this.editMode = false;
    this.editId   = 0;
    this.form.reset({ country: 'India', isActive: true });
    this.showForm = true;
    this.error    = '';
    this.success  = '';
  }

  openEdit(s: Supplier) {
    this.editMode = true;
    this.editId   = s.id;
    this.form.patchValue(s);
    this.showForm = true;
    this.error    = '';
    this.success  = '';
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
  }

  closeForm() {
    this.showForm = false;
    this.form.reset({ country: 'India', isActive: true });
  }

  submit() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.submitting = true;
    const val = this.form.value as CreateSupplierDto & { isActive: boolean };

    const obs = this.editMode
      ? this.svc.update(this.editId, val)
      : this.svc.create(val);

    obs.subscribe({
      next: () => {
        this.success    = `Supplier ${this.editMode ? 'updated' : 'created'} successfully.`;
        this.submitting = false;
        this.showForm   = false;
        this.loadSuppliers();
        setTimeout(() => this.success = '', 4000);
      },
      error: () => {
        this.error      = 'Failed to save supplier.';
        this.submitting = false;
      }
    });
  }

  toggleActive(s: Supplier) {
    this.svc.toggleActive(s.id).subscribe({
      next: res => {
        s.isActive = res.isActive;
        this.applyFilter();
      }
    });
  }

  openRating(s: Supplier) {
    this.ratingModal = { show: true, supplier: s, value: 5 };
  }

  submitRating() {
    if (!this.ratingModal.supplier) return;
    this.svc.rate(this.ratingModal.supplier.id, this.ratingModal.value).subscribe({
      next: () => { this.ratingModal.show = false; this.loadSuppliers(); }
    });
  }

  delete(s: Supplier) {
    if (!confirm(`Delete supplier "${s.companyName}"? This cannot be undone.`)) return;
    this.svc.delete(s.id).subscribe({
      next: () => this.loadSuppliers(),
      error: () => this.error = 'Delete failed.'
    });
  }

  stars(n: number): number[] { return Array(Math.max(0, Math.round(n))).fill(0); }
  readonly Math = Math;

  waLink(num: string): string {
    const digits = num.replace(/\D/g, '');
    const phone  = digits.length === 10 ? '91' + digits : digits;
    return `https://wa.me/${phone}`;
  }

  get f() { return this.form.controls; }
}
