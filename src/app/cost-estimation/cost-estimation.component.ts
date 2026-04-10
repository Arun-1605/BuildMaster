import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_URLS } from '../core/constants';

interface Project {
  id: number; name: string; projectType: string; description: string;
  location: string; totalArea: number; floors: number;
}
interface CostItem {
  id?: number; projectId: number; category: string; itemName: string;
  quantity: number; unit: string; unitPrice: number; totalCost: number; notes: string;
}

@Component({
  selector: 'app-cost-estimation',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cost-estimation.component.html',
  styleUrls: ['./cost-estimation.component.css']
})
export class CostEstimationComponent implements OnInit {
  projects: Project[] = [];
  selectedProjectId: number | null = null;
  items: CostItem[] = [];
  isLoading    = false;
  isEstimating = false;
  showForm     = false;
  editingId: number | null = null;
  form: CostItem = this.emptyItem();

  statusMessage = '';
  statusType: 'success' | 'error' | 'info' = 'info';

  qualityLevel = 'Standard';
  filterCategory = '';
  sortBy: 'amount' | 'name' | 'qty' = 'amount';
  sortDir: 'asc' | 'desc' = 'desc';
  activeTab: 'boq' | 'analysis' | 'summary' = 'boq';

  markupPct     = 10;
  contingencyPct = 5;

  categories  = ['Civil Works', 'Structural Works', 'MEP Works', 'Interior Finishes', 'External Works', 'Contingency & Overheads'];
  qualityOptions = ['Economy', 'Standard', 'Premium'];
  units = ['sqm', 'cum', 'sqft', 'rmt', 'kg', 'MT', 'No.', 'LS', 'bags', 'set'];

  // ── Computed ─────────────────────────────────────────────────────────────

  get selectedProject(): Project | undefined {
    return this.projects.find(p => p.id === this.selectedProjectId);
  }

  get grandTotal(): number { return this.items.reduce((s, i) => s + i.totalCost, 0); }

  get markupAmount():      number { return this.grandTotal * (this.markupPct / 100); }
  get contingencyAmount(): number { return this.grandTotal * (this.contingencyPct / 100); }
  get finalTotal():        number { return this.grandTotal + this.markupAmount + this.contingencyAmount; }

  get costPerSqft(): number {
    const area = this.selectedProject?.totalArea ?? 0;
    return area > 0 ? this.finalTotal / area : 0;
  }

  get filteredItems(): CostItem[] {
    let r = this.filterCategory ? this.items.filter(i => i.category === this.filterCategory) : [...this.items];
    r.sort((a, b) => {
      let cmp = 0;
      if (this.sortBy === 'amount') cmp = a.totalCost - b.totalCost;
      if (this.sortBy === 'name')   cmp = a.itemName.localeCompare(b.itemName);
      if (this.sortBy === 'qty')    cmp = a.quantity - b.quantity;
      return this.sortDir === 'desc' ? -cmp : cmp;
    });
    return r;
  }

  get groupedItems(): { category: string; items: CostItem[]; subtotal: number; pct: number; color: string; icon: string }[] {
    return this.categories
      .map(cat => {
        const catItems = this.items.filter(i => i.category === cat);
        const subtotal = catItems.reduce((s, i) => s + i.totalCost, 0);
        return {
          category: cat, icon: this.getCategoryIcon(cat),
          items: catItems, subtotal,
          pct: this.grandTotal > 0 ? Math.round((subtotal / this.grandTotal) * 100) : 0,
          color: this.getCategoryColor(cat)
        };
      })
      .filter(g => g.items.length > 0)
      .sort((a, b) => b.subtotal - a.subtotal);
  }

  get categoryTotals(): { category: string; total: number; pct: number; color: string; icon: string }[] {
    return this.groupedItems.map(g => ({
      category: g.category, total: g.subtotal, pct: g.pct,
      color: g.color, icon: g.icon
    }));
  }

  // SVG donut (r=50 → circumference = 2π×50 ≈ 314.16)
  private readonly CIRC = 314.16;
  get donutSegments() {
    const total = this.grandTotal || 1;
    let cumulPct = 0;
    return this.categoryTotals.map(ct => {
      const pct = (ct.total / total) * 100;
      const seg = { ...ct, pct, offset: cumulPct };
      cumulPct += pct;
      return seg;
    });
  }
  dashArray(pct: number)     { return `${(pct / 100) * this.CIRC} ${this.CIRC}`; }
  dashOffset(offset: number) { return `${-((offset / 100) * this.CIRC)}`; }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  constructor(private http: HttpClient) {}
  ngOnInit() { this.loadProjects(); }

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

  loadProjects() {
    this.http.get<Project[]>(API_URLS.PROJECTS).subscribe({
      next: d => { this.projects = d; this.clearStatus(); },
      error: () => {
        this.projects = [];
        this.setStatus('Failed to load projects. Please check the API connection.', 'error');
        console.error('Failed to load projects.');
      }
    });
  }

  onProjectChange() {
    this.activeTab = 'boq';
    if (this.selectedProjectId) this.loadItems();
  }

  loadItems() {
    if (!this.selectedProjectId) {
      this.items = [];
      return;
    }
    this.isLoading = true;
    this.http.get<{ items: CostItem[]; total: number }>(`${API_URLS.COST_BY_PROJECT}/${this.selectedProjectId}`).subscribe({
      next: res => {
        this.items = res.items ?? [];
        this.isLoading = false;
        this.clearStatus();
      },
      error: ()  => {
        this.items = [];
        this.isLoading = false;
        this.setStatus('Failed to load BOQ items. Please retry.', 'error');
      }
    });
  }

  toggleSort(col: typeof this.sortBy) {
    if (this.sortBy === col) this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    else { this.sortBy = col; this.sortDir = 'desc'; }
  }

  // ── AI ────────────────────────────────────────────────────────────────────

  runAIEstimate() {
    if (!this.selectedProject) return;
    if (this.items.length > 0 && !confirm('This will add new AI estimates to existing items. Continue?')) return;
    this.isEstimating = true;
    const p = this.selectedProject;
    this.http.post<CostItem[]>(API_URLS.COST_AI_SAVE, {
      projectId: p.id, projectDescription: p.description, projectType: p.projectType,
      plotArea: p.totalArea, floors: p.floors, location: p.location, qualityLevel: this.qualityLevel
    }).subscribe({
      next: () => {
        this.loadItems();
        this.isEstimating = false;
        this.setStatus('AI BOQ estimate generated and saved successfully.', 'success');
      },
      error: ()  => {
        this.isEstimating = false;
        this.setStatus('AI estimate failed. Please ensure Ollama and the API are available.', 'error');
      }
    });
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────

  openAdd() {
    this.form = this.emptyItem();
    this.form.projectId = this.selectedProjectId!;
    this.editingId = null;
    this.showForm = true;
  }

  editItem(item: CostItem) { this.form = { ...item }; this.editingId = item.id!; this.showForm = true; }

  onQtyOrPriceChange() { this.form.totalCost = this.form.quantity * this.form.unitPrice; }

  saveItem() {
    this.form.totalCost = this.form.quantity * this.form.unitPrice;
    const done = () => { this.loadItems(); this.showForm = false; this.setStatus('BOQ item saved successfully.', 'success'); };
    const error = () => { this.setStatus('Failed to save BOQ item. Please try again.', 'error'); };
    if (this.editingId) {
      this.http.put<CostItem>(`${API_URLS.COST_ESTIMATES}/${this.editingId}`, this.form).subscribe({ next: done, error });
    } else {
      this.http.post<CostItem>(API_URLS.COST_ESTIMATES, this.form).subscribe({ next: done, error });
    }
  }

  deleteItem(id: number) {
    if (!confirm('Delete this line item?')) return;
    this.http.delete(`${API_URLS.COST_ESTIMATES}/${id}`).subscribe({
      next: () => { this.loadItems(); this.setStatus('BOQ item deleted.', 'success'); },
      error: () => { this.setStatus('Could not delete the item. Please retry.', 'error'); }
    });
  }

  async clearAllItems() {
    if (!confirm('Delete ALL cost items for this project?')) return;
    try {
      const deletes = this.items
        .filter(i => i.id != null)
        .map(i => firstValueFrom(this.http.delete(`${API_URLS.COST_ESTIMATES}/${i.id}`)));
      await Promise.all(deletes);
      this.loadItems();
      this.setStatus('All BOQ items deleted successfully.', 'success');
    } catch {
      this.setStatus('Failed to delete all items. Please try again.', 'error');
    }
  }

  // ── Export ────────────────────────────────────────────────────────────────

  exportCSV() {
    const header = 'Category,Description,Quantity,Unit,Unit Rate (₹),Amount (₹),Notes\n';
    const rows = this.items.map(i =>
      `"${i.category}","${i.itemName}",${i.quantity},"${i.unit}",${i.unitPrice},${i.totalCost},"${(i.notes ?? '').replace(/"/g, '""')}"`
    ).join('\n');
    const summary = `\n\nSubtotal,,,,,${this.grandTotal}\nMarkup (${this.markupPct}%),,,,,${this.markupAmount.toFixed(0)}\nContingency (${this.contingencyPct}%),,,,,${this.contingencyAmount.toFixed(0)}\nFinal Total,,,,,${this.finalTotal.toFixed(0)}`;
    const blob = new Blob([header + rows + summary], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `boq-${this.selectedProject?.name ?? 'export'}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  printBOQ() { window.print(); }

  // ── Helpers ───────────────────────────────────────────────────────────────

  getCategoryColor(cat: string): string {
    const m: Record<string, string> = {
      'Civil Works': '#3b82f6', 'Structural Works': '#8b5cf6', 'MEP Works': '#06b6d4',
      'Interior Finishes': '#f59e0b', 'External Works': '#22c55e', 'Contingency & Overheads': '#94a3b8'
    };
    return m[cat] ?? '#64748b';
  }

  getCategoryIcon(cat: string): string {
    const m: Record<string, string> = {
      'Civil Works': '🏗️', 'Structural Works': '🔩', 'MEP Works': '⚡',
      'Interior Finishes': '🎨', 'External Works': '🌿', 'Contingency & Overheads': '📋'
    };
    return m[cat] ?? '📦';
  }

  sortIcon(col: string) { return this.sortBy === col ? (this.sortDir === 'desc' ? '▼' : '▲') : '⇅'; }

  getCategoryPct(category: string): number {
    return Math.round(this.categoryTotals.find(ct => ct.category === category)?.pct ?? 0);
  }

  fmt(n: number): string { return '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 }); }

  emptyItem(): CostItem {
    return { projectId: 0, category: 'Civil Works', itemName: '', quantity: 0, unit: 'sqm', unitPrice: 0, totalCost: 0, notes: '' };
  }
}
