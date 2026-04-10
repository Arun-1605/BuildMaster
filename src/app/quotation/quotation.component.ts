import { Component, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import {
  QuotationService, QuotationSummary, QuotationRequest,
  CreateQuotationDto, SendQuotationDto, SubmitResponseDto, QuotationSupplierDto
} from '../service/quotation.service';
import { SupplierService, Supplier } from '../service/supplier.service';

type View = 'list' | 'create' | 'detail';

@Component({
  selector: 'app-quotation',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, DatePipe],
  templateUrl: './quotation.component.html',
  styleUrls: ['./quotation.component.css']
})
export class QuotationComponent implements OnInit {
  view: View = 'list';

  // List
  summaries: QuotationSummary[] = [];
  filteredSummaries: QuotationSummary[] = [];
  filterStatus = '';
  filterText   = '';
  loading      = true;

  // Detail
  detail: QuotationRequest | null = null;
  detailLoading = false;

  // Create
  rfqForm!: FormGroup;
  allSuppliers: Supplier[]     = [];
  selectedSupplierIds: Set<number> = new Set();
  submitting = false;

  // Send
  sendModal: { show: boolean; rfqId: number; via: string } = { show: false, rfqId: 0, via: 'Both' };
  sendResult: any[] = [];
  sending = false;

  // Response entry
  responseModal: { show: boolean; qs: QuotationSupplierDto | null; rfqId: number } =
    { show: false, qs: null, rfqId: 0 };
  responseForm!: FormGroup;

  // Select winner
  selectModal: { show: boolean; rfqId: number; supplierId: number; name: string } =
    { show: false, rfqId: 0, supplierId: 0, name: '' };
  selectReason = '';

  error   = '';
  success = '';

  UNITS = ['bags', 'MT', 'cft', 'sqft', 'nos', 'kg', 'ltr', 'running m', 'cum', 'sqm'];

  constructor(
    private qSvc: QuotationService,
    private sSvc: SupplierService,
    private fb: FormBuilder
  ) {}

  ngOnInit() {
    this.buildRfqForm();
    this.buildResponseForm();
    this.loadList();
    this.sSvc.getAllActive().subscribe({ next: s => this.allSuppliers = s });
  }

  // ── Form builders ────────────────────────────────────────────────────────

  buildRfqForm() {
    this.rfqForm = this.fb.group({
      projectName:     ['', Validators.required],
      subject:         ['', Validators.required],
      requiredByDate:  [''],
      deliveryAddress: [''],
      totalBudget:     [''],
      notes:           [''],
      createdBy:       [''],
      items: this.fb.array([this.newItemRow()])
    });
  }

  buildResponseForm() {
    this.responseForm = this.fb.group({
      totalOfferedAmount: [''],
      validUntil:         [''],
      leadTimeDays:       [''],
      deliveryTerms:      [''],
      paymentTerms:       [''],
      supplierComments:   [''],
      receivedVia:        ['Email'],
      items:              this.fb.array([])
    });
  }

  newItemRow() {
    return this.fb.group({
      materialName:   ['', Validators.required],
      description:    [''],
      quantity:       [1, [Validators.required, Validators.min(0.001)]],
      unit:           ['bags', Validators.required],
      targetPrice:    [''],
      specifications: ['']
    });
  }

  get items(): FormArray { return this.rfqForm.get('items') as FormArray; }
  get rItems(): FormArray { return this.responseForm.get('items') as FormArray; }

  addItem()       { this.items.push(this.newItemRow()); }
  removeItem(i: number) { if (this.items.length > 1) this.items.removeAt(i); }

  // ── List ─────────────────────────────────────────────────────────────────

  loadList() {
    this.loading = true;
    this.qSvc.getAll().subscribe({
      next: data => { this.summaries = data; this.applyFilter(); this.loading = false; },
      error: () => { this.error = 'Failed to load quotations.'; this.loading = false; }
    });
  }

  applyFilter() {
    let data = [...this.summaries];
    if (this.filterStatus) data = data.filter(s => s.status === this.filterStatus);
    if (this.filterText)
      data = data.filter(s =>
        s.rfqNumber.toLowerCase().includes(this.filterText.toLowerCase()) ||
        s.projectName.toLowerCase().includes(this.filterText.toLowerCase()) ||
        s.subject.toLowerCase().includes(this.filterText.toLowerCase())
      );
    this.filteredSummaries = data;
  }

  // ── Create ───────────────────────────────────────────────────────────────

  openCreate() {
    this.view     = 'create';
    this.error    = '';
    this.success  = '';
    this.selectedSupplierIds = new Set();
    this.buildRfqForm();
  }

  toggleSupplier(id: number) {
    this.selectedSupplierIds.has(id)
      ? this.selectedSupplierIds.delete(id)
      : this.selectedSupplierIds.add(id);
  }

  createRFQ() {
    if (this.rfqForm.invalid) { this.rfqForm.markAllAsTouched(); return; }
    this.submitting = true;
    const v = this.rfqForm.value;

    const dto: CreateQuotationDto = {
      projectName:     v.projectName,
      subject:         v.subject,
      requiredByDate:  v.requiredByDate || undefined,
      deliveryAddress: v.deliveryAddress,
      totalBudget:     v.totalBudget    || undefined,
      notes:           v.notes,
      createdBy:       v.createdBy,
      items:           v.items,
      supplierIds:     Array.from(this.selectedSupplierIds)
    };

    this.qSvc.create(dto).subscribe({
      next: created => {
        this.submitting = false;
        this.success    = `RFQ ${created.rfqNumber} created!`;
        this.loadList();
        this.openDetail(created.id);
      },
      error: (err) => {
        this.submitting = false;
        this.error = err.error?.message || err.error?.title || 'Failed to create RFQ. Please check all required fields.';
        if (err.error?.errors) {
          const errors = Object.values(err.error.errors).flat();
          this.error += ' ' + errors.join(' ');
        }
      }
    });
  }

  // ── Detail ───────────────────────────────────────────────────────────────

  openDetail(id: number) {
    this.view         = 'detail';
    this.detail       = null;
    this.detailLoading = true;
    this.error        = '';
    this.qSvc.getById(id).subscribe({
      next: d => { this.detail = d; this.detailLoading = false; },
      error: () => { this.error = 'Failed to load RFQ.'; this.detailLoading = false; }
    });
  }

  goList() { this.view = 'list'; this.detail = null; this.loadList(); }

  // ── Send ─────────────────────────────────────────────────────────────────

  openSend(rfqId: number) {
    this.sendModal  = { show: true, rfqId, via: 'Both' };
    this.sendResult = [];
    this.error      = '';
  }

  send() {
    if (!this.detail) return;
    this.sending = true;
    const dto: SendQuotationDto = {
      quotationRequestId: this.sendModal.rfqId,
      supplierIds: this.detail.suppliers.map(s => s.supplierId),
      sendVia: this.sendModal.via as any
    };
    this.qSvc.send(dto).subscribe({
      next: res => {
        this.sendResult = res.results;
        this.sending    = false;
        this.openDetail(this.sendModal.rfqId);
      },
      error: () => { this.error = 'Send failed.'; this.sending = false; }
    });
  }

  // ── Receive Response ─────────────────────────────────────────────────────

  openResponseModal(qs: QuotationSupplierDto) {
    this.responseModal = { show: true, qs, rfqId: this.detail!.id };
    this.buildResponseForm();

    // Build one row per item
    this.detail!.items.forEach(item => {
      this.rItems.push(this.fb.group({
        quotationItemId: [item.id],
        materialName:    [item.materialName],
        offeredPrice:    [0, [Validators.required, Validators.min(0)]],
        offeredQuantity: [item.quantity, [Validators.required, Validators.min(0)]],
        unit:            [item.unit],
        taxPercentage:   [18]
      }));
    });
  }

  submitResponse() {
    if (this.responseForm.invalid || !this.responseModal.qs) return;
    const v = this.responseForm.value;
    const dto: SubmitResponseDto = {
      quotationSupplierId: this.responseModal.qs.id,
      quotationRequestId:  this.responseModal.rfqId,
      supplierId:          this.responseModal.qs.supplierId,
      totalOfferedAmount:  v.totalOfferedAmount || undefined,
      validUntil:          v.validUntil         || undefined,
      leadTimeDays:        v.leadTimeDays        || undefined,
      deliveryTerms:       v.deliveryTerms,
      paymentTerms:        v.paymentTerms,
      supplierComments:    v.supplierComments,
      receivedVia:         v.receivedVia,
      items:               v.items
    };

    this.qSvc.submitResponse(dto).subscribe({
      next: () => {
        this.responseModal.show = false;
        this.success = 'Response recorded.';
        this.openDetail(this.responseModal.rfqId);
        setTimeout(() => this.success = '', 4000);
      },
      error: () => this.error = 'Failed to save response.'
    });
  }

  calcLineTotal(i: number): number {
    const row = this.rItems.at(i).value;
    return row.offeredPrice * row.offeredQuantity * (1 + row.taxPercentage / 100);
  }

  calcResponseTotal(): number {
    let total = 0;
    for (let i = 0; i < this.rItems.length; i++) total += this.calcLineTotal(i);
    return total;
  }

  // ── Select Winner ────────────────────────────────────────────────────────

  openSelectModal(supplierId: number, name: string) {
    this.selectModal  = { show: true, rfqId: this.detail!.id, supplierId, name };
    this.selectReason = '';
  }

  confirmSelect() {
    const { rfqId, supplierId } = this.selectModal;
    this.qSvc.selectSupplier(rfqId, supplierId, this.selectReason).subscribe({
      next: () => {
        this.selectModal.show = false;
        this.success = 'Supplier selected! RFQ closed.';
        this.openDetail(rfqId);
        this.loadList();
        setTimeout(() => this.success = '', 5000);
      },
      error: () => this.error = 'Failed to select supplier.'
    });
  }

  // ── WhatsApp direct link ─────────────────────────────────────────────────

  waLink(num: string, rfqNumber: string): string {
    const digits  = num.replace(/\D/g, '');
    const phone   = digits.length === 10 ? '91' + digits : digits;
    const msg     = `Hi, I'm reaching out about RFQ ${rfqNumber}. Please send your best quote.`;
    return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  }

  statusColor(s: string): string {
    const map: Record<string, string> = {
      Draft: '#64748b', Sent: '#3b82f6', PartiallyReceived: '#f59e0b',
      Closed: '#22c55e', Cancelled: '#ef4444'
    };
    return map[s] ?? '#64748b';
  }

  get rf() { return this.rfqForm.controls; }
  get rsp() { return this.responseForm.controls; }
}
