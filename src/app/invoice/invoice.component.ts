import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_URLS } from '../core/constants';

interface Project {
  id?: number;
  name: string;
  description: string;
  clientName: string;
  location: string;
  startDate: string;
  endDate: string;
  budget: number;
  status: string;
  projectType: string;
  totalArea: number;
  floors: number;
  createdAt?: string;
}

interface Invoice {
  id?: number;
  projectId: number;
  projectName: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  clientName: string;
  clientAddress: string;
  clientEmail: string;
  clientPhone: string;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  discount: number;
  totalAmount: number;
  status: string;
  notes: string;
  templateId?: number;
  templateName?: string;
  createdAt: string;
  updatedAt?: string;
  items: InvoiceItem[];
}

interface InvoiceItem {
  id?: number;
  invoiceId?: number;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
  costEstimateId?: number;
  costEstimateItemName?: string;
}

interface CostEstimate {
  id: number;
  itemName: string;
  category: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalCost: number;
}

@Component({
  selector: 'app-invoice',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './invoice.component.html',
  styleUrls: ['./invoice.component.css']
})
export class InvoiceComponent implements OnInit {
  projects: Project[] = [];
  selectedProjectId: number | null = null;
  invoices: Invoice[] = [];
  costEstimates: CostEstimate[] = [];
  isLoading = false;
  showForm = false;
  showTemplateForm = false;
  editingId: number | null = null;
  editingTemplateId: number | null = null;

  form: Invoice = this.emptyInvoice();
  templateForm = {
    name: '',
    description: '',
    templateHtml: '',
    placeholders: [] as PlaceholderDefinition[]
  };

  statusMessage = '';
  statusType: 'success' | 'error' | 'info' = 'info';

  activeTab: 'invoices' | 'templates' = 'invoices';
  selectedBoqItems: number[] = [];
  showBoqSelector = false;

  statuses = ['Draft', 'Sent', 'Paid', 'Overdue', 'Cancelled'];
  units = ['sqm', 'cum', 'sqft', 'rmt', 'kg', 'MT', 'No.', 'LS', 'bags', 'set'];

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadProjects();
    this.loadInvoices();
  }

  setStatus(message: string, type: 'success' | 'error' | 'info' = 'info') {
    this.statusMessage = message;
    this.statusType = type;
    if (type === 'success') {
      setTimeout(() => { if (this.statusType === 'success') this.clearStatus(); }, 4500);
    }
  }

  clearStatus() {
    this.statusMessage = '';
  }

  // ── Data Loading ──────────────────────────────────────────────────────────

  loadProjects() {
    this.http.get<Project[]>(API_URLS.PROJECTS).subscribe({
      next: data => this.projects = data,
      error: () => this.setStatus('Failed to load projects', 'error')
    });
  }

  loadInvoices() {
    this.isLoading = true;
    this.http.get<Invoice[]>(API_URLS.INVOICES).subscribe({
      next: data => {
        this.invoices = data;
        this.isLoading = false;
      },
      error: () => {
        this.invoices = [];
        this.isLoading = false;
        this.setStatus('Failed to load invoices', 'error');
      }
    });
  }

  loadCostEstimates() {
    if (!this.selectedProjectId) return;
    this.http.get<{ items: CostEstimate[] }>(`${API_URLS.COST_BY_PROJECT}/${this.selectedProjectId}`).subscribe({
      next: res => this.costEstimates = res.items || [],
      error: () => this.setStatus('Failed to load BOQ items', 'error')
    });
  }

  // ── Invoice CRUD ──────────────────────────────────────────────────────────

  openAdd() {
    this.form = this.emptyInvoice();
    this.editingId = null;
    this.showForm = true;
  }

  editInvoice(invoice: Invoice) {
    this.form = { ...invoice };
    this.editingId = invoice.id!;
    this.showForm = true;
  }

  saveInvoice() {
    // Validation
    if (!this.form.invoiceNumber?.trim()) {
      this.setStatus('Invoice number is required', 'error');
      return;
    }
    if (!this.form.clientName?.trim()) {
      this.setStatus('Client name is required', 'error');
      return;
    }
    if (!this.form.projectId) {
      this.setStatus('Project is required', 'error');
      return;
    }
    if (!this.form.items.length) {
      this.setStatus('At least one item is required', 'error');
      return;
    }

    // Calculate totals
    this.calculateTotals();

    const done = () => {
      this.loadInvoices();
      this.showForm = false;
      this.setStatus('Invoice saved successfully', 'success');
    };
    const error = (err: any) => {
      console.error('Save error:', err);
      this.setStatus('Failed to save invoice', 'error');
    };

    if (this.editingId) {
      this.http.put<Invoice>(`${API_URLS.INVOICES}/${this.editingId}`, this.form).subscribe({ next: done, error });
    } else {
      this.http.post<Invoice>(API_URLS.INVOICES, this.form).subscribe({ next: done, error });
    }
  }

  deleteInvoice(id: number) {
    if (!confirm('Delete this invoice?')) return;
    this.http.delete(`${API_URLS.INVOICES}/${id}`).subscribe({
      next: () => {
        this.loadInvoices();
        this.setStatus('Invoice deleted', 'success');
      },
      error: () => this.setStatus('Failed to delete invoice', 'error')
    });
  }

  // ── Generate from BOQ ─────────────────────────────────────────────────────

  openBoqGenerator() {
    if (!this.selectedProjectId) {
      this.setStatus('Please select a project first', 'error');
      return;
    }
    this.loadCostEstimates();
    this.showBoqSelector = true;
  }

  generateFromBoq() {
    if (!this.selectedProjectId || !this.selectedBoqItems.length) {
      this.setStatus('Please select BOQ items', 'error');
      return;
    }

    const project = this.projects.find(p => p.id === this.selectedProjectId);
    if (!project) return;

    const payload = {
      projectId: this.selectedProjectId,
      costEstimateIds: this.selectedBoqItems,
      invoiceDate: new Date().toISOString().split('T')[0],
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      clientName: project.clientName || '',
      clientAddress: '',
      clientEmail: '',
      clientPhone: '',
      taxRate: 18,
      discount: 0,
      notes: `Invoice generated from BOQ for project: ${project.name}`
    };

    this.http.post<Invoice>(API_URLS.INVOICE_GENERATE_FROM_BOQ, payload).subscribe({
      next: () => {
        this.loadInvoices();
        this.showBoqSelector = false;
        this.selectedBoqItems = [];
        this.setStatus('Invoice generated from BOQ successfully', 'success');
      },
      error: () => this.setStatus('Failed to generate invoice from BOQ', 'error')
    });
  }

  // ── Invoice Items ─────────────────────────────────────────────────────────

  addItem() {
    this.form.items.push({
      description: '',
      quantity: 1,
      unit: 'No.',
      unitPrice: 0,
      totalPrice: 0
    });
  }

  removeItem(index: number) {
    this.form.items.splice(index, 1);
    this.calculateTotals();
  }

  onItemChange() {
    this.calculateTotals();
  }

  calculateTotals() {
    let subtotal = 0;
    this.form.items.forEach(item => {
      item.totalPrice = item.quantity * item.unitPrice;
      subtotal += item.totalPrice;
    });
    this.form.subtotal = subtotal;
    this.form.taxAmount = subtotal * (this.form.taxRate / 100);
    this.form.totalAmount = subtotal + this.form.taxAmount - this.form.discount;
  }

  // ── Template Management ───────────────────────────────────────────────────

  openTemplateCreator() {
    this.templateForm = {
      name: '',
      description: '',
      templateHtml: this.getDefaultTemplateHtml(),
      placeholders: this.getDefaultPlaceholders()
    };
    this.editingTemplateId = null;
    this.showTemplateForm = true;
  }

  saveTemplate() {
    if (!this.templateForm.name?.trim()) {
      this.setStatus('Template name is required', 'error');
      return;
    }

    const payload = {
      name: this.templateForm.name,
      description: this.templateForm.description,
      templateHtml: this.templateForm.templateHtml,
      placeholders: this.templateForm.placeholders
    };

    const done = () => {
      this.showTemplateForm = false;
      this.setStatus('Template saved successfully', 'success');
    };

    if (this.editingTemplateId) {
      this.http.put(`${API_URLS.INVOICE_TEMPLATES}/${this.editingTemplateId}`, payload).subscribe({ next: done });
    } else {
      this.http.post(API_URLS.INVOICE_TEMPLATES, payload).subscribe({ next: done });
    }
  }

  addPlaceholder() {
    this.templateForm.placeholders.push({
      key: '',
      label: '',
      type: 'text',
      defaultValue: '',
      required: false
    });
  }

  removePlaceholder(index: number) {
    this.templateForm.placeholders.splice(index, 1);
  }

  // ── Export ────────────────────────────────────────────────────────────────

  exportCSV() {
    const header = 'Invoice Number,Date,Due Date,Client,Total Amount,Status\n';
    const rows = this.invoices.map(inv =>
      `"${inv.invoiceNumber}","${inv.invoiceDate}","${inv.dueDate}","${inv.clientName}",${inv.totalAmount},"${inv.status}"`
    ).join('\n');
    this.downloadFile(header + rows, 'invoices.csv', 'text/csv');
  }

  printInvoice(invoice: Invoice) {
    // Simple print implementation - in real app, use proper PDF generation
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head><title>Invoice ${invoice.invoiceNumber}</title></head>
          <body>
            <h1>Invoice ${invoice.invoiceNumber}</h1>
            <p><strong>Client:</strong> ${invoice.clientName}</p>
            <p><strong>Date:</strong> ${invoice.invoiceDate}</p>
            <p><strong>Due Date:</strong> ${invoice.dueDate}</p>
            <table border="1" style="width:100%">
              <tr><th>Description</th><th>Qty</th><th>Unit</th><th>Rate</th><th>Amount</th></tr>
              ${invoice.items.map(item => `
                <tr>
                  <td>${item.description}</td>
                  <td>${item.quantity}</td>
                  <td>${item.unit}</td>
                  <td>₹${item.unitPrice}</td>
                  <td>₹${item.totalPrice}</td>
                </tr>
              `).join('')}
            </table>
            <p><strong>Subtotal:</strong> ₹${invoice.subtotal}</p>
            <p><strong>Tax (${invoice.taxRate}%):</strong> ₹${invoice.taxAmount}</p>
            <p><strong>Discount:</strong> ₹${invoice.discount}</p>
            <p><strong>Total:</strong> ₹${invoice.totalAmount}</p>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  downloadFile(content: string, filename: string, mimeType: string) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  emptyInvoice(): Invoice {
    return {
      projectId: this.selectedProjectId || 0,
      projectName: '',
      invoiceNumber: '',
      invoiceDate: new Date().toISOString().split('T')[0],
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      clientName: '',
      clientAddress: '',
      clientEmail: '',
      clientPhone: '',
      subtotal: 0,
      taxRate: 18,
      taxAmount: 0,
      discount: 0,
      totalAmount: 0,
      status: 'Draft',
      notes: '',
      createdAt: '',
      items: []
    };
  }

  getDefaultTemplateHtml(): string {
    return `
<div class="invoice-header">
  <div class="company-info">
    <h1>{{companyName}}</h1>
    <p>{{companyAddress}}</p>
    <p>Phone: {{companyPhone}}</p>
    <p>Email: {{companyEmail}}</p>
  </div>
  <div class="invoice-info">
    <h2>INVOICE</h2>
    <p><strong>Invoice #:</strong> {{invoiceNumber}}</p>
    <p><strong>Date:</strong> {{invoiceDate}}</p>
    <p><strong>Due Date:</strong> {{dueDate}}</p>
  </div>
</div>

<div class="client-info">
  <h3>Bill To:</h3>
  <p><strong>{{clientName}}</strong></p>
  <p>{{clientAddress}}</p>
  <p>Phone: {{clientPhone}}</p>
  <p>Email: {{clientEmail}}</p>
</div>

<table class="invoice-table">
  <thead>
    <tr>
      <th>Description</th>
      <th>Quantity</th>
      <th>Unit</th>
      <th>Unit Price</th>
      <th>Total</th>
    </tr>
  </thead>
  <tbody>
    {{#items}}
    <tr>
      <td>{{description}}</td>
      <td>{{quantity}}</td>
      <td>{{unit}}</td>
      <td>₹{{unitPrice}}</td>
      <td>₹{{totalPrice}}</td>
    </tr>
    {{/items}}
  </tbody>
</table>

<div class="totals">
  <p><strong>Subtotal:</strong> ₹{{subtotal}}</p>
  <p><strong>Tax ({{taxRate}}%):</strong> ₹{{taxAmount}}</p>
  <p><strong>Discount:</strong> ₹{{discount}}</p>
  <p><strong>Total Amount:</strong> ₹{{totalAmount}}</p>
</div>

<div class="notes">
  <p><strong>Notes:</strong> {{notes}}</p>
</div>
    `.trim();
  }

  getDefaultPlaceholders(): PlaceholderDefinition[] {
    return [
      { key: 'companyName', label: 'Company Name', type: 'text', defaultValue: 'BuildMaster Construction', required: true },
      { key: 'companyAddress', label: 'Company Address', type: 'textarea', defaultValue: '', required: false },
      { key: 'companyPhone', label: 'Company Phone', type: 'text', defaultValue: '', required: false },
      { key: 'companyEmail', label: 'Company Email', type: 'text', defaultValue: '', required: false },
      { key: 'invoiceNumber', label: 'Invoice Number', type: 'text', defaultValue: '', required: true },
      { key: 'invoiceDate', label: 'Invoice Date', type: 'date', defaultValue: '', required: true },
      { key: 'dueDate', label: 'Due Date', type: 'date', defaultValue: '', required: true },
      { key: 'clientName', label: 'Client Name', type: 'text', defaultValue: '', required: true },
      { key: 'clientAddress', label: 'Client Address', type: 'textarea', defaultValue: '', required: false },
      { key: 'clientPhone', label: 'Client Phone', type: 'text', defaultValue: '', required: false },
      { key: 'clientEmail', label: 'Client Email', type: 'text', defaultValue: '', required: false },
      { key: 'subtotal', label: 'Subtotal', type: 'number', defaultValue: '0', required: true },
      { key: 'taxRate', label: 'Tax Rate (%)', type: 'number', defaultValue: '18', required: true },
      { key: 'taxAmount', label: 'Tax Amount', type: 'number', defaultValue: '0', required: true },
      { key: 'discount', label: 'Discount', type: 'number', defaultValue: '0', required: false },
      { key: 'totalAmount', label: 'Total Amount', type: 'number', defaultValue: '0', required: true },
      { key: 'notes', label: 'Notes', type: 'textarea', defaultValue: '', required: false }
    ];
  }
}

interface PlaceholderDefinition {
  key: string;
  label: string;
  type: string;
  defaultValue: string;
  required: boolean;
}
