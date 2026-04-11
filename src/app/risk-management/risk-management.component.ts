import { Component, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { API_URLS } from '../core/constants';
import { StatusCountPipe } from './status-count.pipe';

interface Project {
  id: number; name: string; projectType: string; description: string;
  location: string; budget: number; totalArea: number; floors: number;
}
interface Risk {
  id?: number; projectId: number; title: string; description: string;
  category: string; probability: number; impact: number; status: string;
  mitigationStrategy: string; owner: string; identifiedDate?: string;
  riskScore?: number; riskLevel?: string;
  responseType?: string;   // ISO 31000: Avoid, Transfer, Mitigate, Accept
  targetDate?: string;     // Target resolution date
}

@Component({
  selector: 'app-risk-management',
  standalone: true,
  imports: [CommonModule, FormsModule, StatusCountPipe, DatePipe],
  templateUrl: './risk-management.component.html',
  styleUrls: ['./risk-management.component.css']
})
export class RiskManagementComponent implements OnInit {
  projects: Project[] = [];
  selectedProjectId: number | null = null;
  risks: Risk[] = [];
  isLoading    = false;
  isAssessing  = false;
  showForm     = false;
  editingId: number | null = null;

  form: Risk = this.emptyRisk();

  categories     = ['Safety', 'Financial', 'Schedule', 'Technical', 'Environmental', 'Regulatory'];
  statuses       = ['Open', 'Monitoring', 'Mitigated', 'Closed'];
  responseTypes  = ['Avoid', 'Transfer', 'Mitigate', 'Accept'];
  responseIcons: Record<string, string> = { Avoid:'🚫', Transfer:'🔁', Mitigate:'🛡️', Accept:'✅' };
  levelScale  = [1, 2, 3, 4, 5];
  levelLabels: Record<number, string> = { 1:'Very Low', 2:'Low', 3:'Medium', 4:'High', 5:'Very High' };

  filterCategory = '';
  filterStatus   = '';
  sortBy: 'score' | 'category' | 'status' = 'score';
  sortDir: 'asc' | 'desc' = 'desc';
  activeTab: 'register' | 'matrix' | 'summary' = 'register';
  matrixHover: Risk[] = [];
  matrixTooltip = '';

  // ── Computed ─────────────────────────────────────────────────────────────

  get selectedProject(): Project | undefined {
    return this.projects.find(p => p.id === this.selectedProjectId);
  }

  get filteredRisks(): Risk[] {
    let r = [...this.risks];
    if (this.filterCategory) r = r.filter(x => x.category === this.filterCategory);
    if (this.filterStatus)   r = r.filter(x => x.status   === this.filterStatus);
    r.sort((a, b) => {
      let cmp = 0;
      if (this.sortBy === 'score')    cmp = (a.riskScore ?? 0) - (b.riskScore ?? 0);
      if (this.sortBy === 'category') cmp = a.category.localeCompare(b.category);
      if (this.sortBy === 'status')   cmp = a.status.localeCompare(b.status);
      return this.sortDir === 'desc' ? -cmp : cmp;
    });
    return r;
  }

  get criticalCount()  { return this.risks.filter(r => (r.riskScore ?? 0) >= 17).length; }
  get highCount()      { return this.risks.filter(r => { const s = r.riskScore ?? 0; return s >= 10 && s < 17; }).length; }
  get mediumCount()    { return this.risks.filter(r => { const s = r.riskScore ?? 0; return s >= 5 && s < 10; }).length; }
  get lowCount()       { return this.risks.filter(r => (r.riskScore ?? 0) < 5).length; }
  get openCount()      { return this.risks.filter(r => r.status === 'Open').length; }
  get mitigatedCount() { return this.risks.filter(r => r.status === 'Mitigated' || r.status === 'Closed').length; }

  get categoryStats(): { cat: string; count: number; maxScore: number; icon: string }[] {
    return this.categories
      .map(cat => ({
        cat, icon: this.getCategoryIcon(cat),
        count: this.risks.filter(r => r.category === cat).length,
        maxScore: Math.max(0, ...this.risks.filter(r => r.category === cat).map(r => r.riskScore ?? 0))
      }))
      .filter(x => x.count > 0)
      .sort((a, b) => b.maxScore - a.maxScore);
  }

  // SVG donut (r=40 → circumference = 2π×40 ≈ 251.2)
  private readonly CIRC = 251.2;
  get donutSegments() {
    const total = this.risks.length || 1;
    const levels = [
      { label:'Critical', count: this.criticalCount, color:'#ef4444' },
      { label:'High',     count: this.highCount,     color:'#f97316' },
      { label:'Medium',   count: this.mediumCount,   color:'#f59e0b' },
      { label:'Low',      count: this.lowCount,      color:'#22c55e' },
    ];
    let cumulPct = 0;
    return levels.map(l => {
      const pct = (l.count / total) * 100;
      const seg = { ...l, pct, offset: cumulPct };
      cumulPct += pct;
      return seg;
    });
  }
  dashArray(pct: number)     { return `${(pct / 100) * this.CIRC} ${this.CIRC}`; }
  dashOffset(offset: number) { return `${-((offset / 100) * this.CIRC)}`; }

  statusMessage = '';
  statusType: 'success' | 'error' | 'info' = 'info';

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
    this.http.get<Project[]>(API_URLS.PROJECTS).subscribe({ next: d => this.projects = d });
  }

  onProjectChange() { if (this.selectedProjectId) this.loadRisks(); }

  loadRisks() {
    if (!this.selectedProjectId) return;
    this.isLoading = true;
    this.http.get<Risk[]>(`${API_URLS.RISK_BY_PROJECT}/${this.selectedProjectId}`).subscribe({
      next: data => {
        this.risks = data.map(r => ({
          ...r, riskScore: r.probability * r.impact,
          riskLevel: this.calcLevel(r.probability * r.impact)
        }));
        this.isLoading = false;
      },
      error: () => { this.isLoading = false; }
    });
  }

  calcLevel(score: number): string {
    if (score >= 17) return 'Critical';
    if (score >= 10) return 'High';
    if (score >= 5)  return 'Medium';
    return 'Low';
  }

  toggleSort(col: typeof this.sortBy) {
    if (this.sortBy === col) this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    else { this.sortBy = col; this.sortDir = 'desc'; }
  }

  // ── AI ────────────────────────────────────────────────────────────────────

  runAIAssessment() {
    if (!this.selectedProject) return;
    this.isAssessing = true;
    const p = this.selectedProject;
    this.http.post<Risk[]>(API_URLS.RISK_AI_SAVE, {
      projectId: p.id, projectName: p.name, projectDescription: p.description,
      projectType: p.projectType, location: p.location,
      budget: p.budget, totalArea: p.totalArea, floors: p.floors
    }).subscribe({
      next: () => { this.loadRisks(); this.isAssessing = false; },
      error: () => { this.isAssessing = false; }
    });
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────

  quickStatus(risk: Risk, status: string) {
    this.http.put<Risk>(`${API_URLS.RISKS}/${risk.id}`, { ...risk, status })
      .subscribe({ next: () => { risk.status = status; } });
  }

  openAdd() {
    this.form = this.emptyRisk();
    this.form.projectId = this.selectedProjectId!;
    this.editingId = null;
    this.showForm = true;
  }

  editRisk(r: Risk) { this.form = { ...r }; this.editingId = r.id!; this.showForm = true; }

  saveRisk() {
    // Frontend validation
    if (!this.form.title?.trim()) {
      this.setStatus('Risk title is required.', 'error');
      return;
    }
    if (!this.form.description?.trim()) {
      this.setStatus('Risk description is required.', 'error');
      return;
    }
    if (!this.form.category) {
      this.setStatus('Risk category is required.', 'error');
      return;
    }
    if (this.form.probability < 1 || this.form.probability > 5) {
      this.setStatus('Probability must be between 1 and 5.', 'error');
      return;
    }
    if (this.form.impact < 1 || this.form.impact > 5) {
      this.setStatus('Impact must be between 1 and 5.', 'error');
      return;
    }

    const done = () => { this.loadRisks(); this.showForm = false; };
    const error = (err: any) => {
      console.error('Save error:', err);
      this.setStatus('Failed to save risk. Please try again.', 'error');
    };
    if (this.editingId) {
      this.http.put<Risk>(`${API_URLS.RISKS}/${this.editingId}`, this.form).subscribe({ next: done, error });
    } else {
      this.http.post<Risk>(API_URLS.RISKS, this.form).subscribe({ next: done, error });
    }
  }

  deleteRisk(id: number) {
    if (!confirm('Delete this risk?')) return;
    this.http.delete(`${API_URLS.RISKS}/${id}`).subscribe({ next: () => this.loadRisks() });
  }

  // ── Export ────────────────────────────────────────────────────────────────

  exportCSV() {
    const header = 'Title,Category,Probability,Impact,Risk Score,Level,Status,Owner,Mitigation\n';
    const rows = this.filteredRisks.map(r =>
      `"${r.title}","${r.category}",${r.probability},${r.impact},${r.riskScore},"${r.riskLevel}","${r.status}","${r.owner ?? ''}","${(r.mitigationStrategy ?? '').replace(/"/g, '""')}"`
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `risk-register-${this.selectedProject?.name ?? 'export'}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  matrixCell(prob: number, imp: number): Risk[] {
    return this.risks.filter(r => r.probability === prob && r.impact === imp);
  }

  getRiskColor(score: number): string {
    if (score >= 17) return '#ef4444';
    if (score >= 10) return '#f97316';
    if (score >= 5)  return '#f59e0b';
    return '#22c55e';
  }
  getLevelBadge(level: string): string {
    return ({Critical:'badge-red', High:'badge-orange', Medium:'badge-yellow', Low:'badge-green'} as any)[level] ?? 'badge-gray';
  }
  getStatusBadge(s: string): string {
    return ({Open:'badge-red', Monitoring:'badge-yellow', Mitigated:'badge-blue', Closed:'badge-green'} as any)[s] ?? 'badge-gray';
  }
  getCategoryIcon(c: string): string {
    return ({Safety:'⛑️', Financial:'💰', Schedule:'📅', Technical:'⚙️', Environmental:'🌿', Regulatory:'📋'} as any)[c] ?? '⚠️';
  }
  sortIcon(col: string) { return this.sortBy === col ? (this.sortDir === 'desc' ? '▼' : '▲') : '⇅'; }

  emptyRisk(): Risk {
    return { projectId:0, title:'', description:'', category:'Safety', probability:1, impact:1, status:'Open', mitigationStrategy:'', owner:'', responseType:'Mitigate', targetDate:'' };
  }

  exportPDF() {
    const p = this.selectedProject;
    if (!p) return;
    const w = window.open('', '_blank')!;
    const rows = this.filteredRisks.map(r => `
      <tr style="border-bottom:1px solid #ddd">
        <td>${r.title}</td>
        <td>${r.category}</td>
        <td style="text-align:center">${r.probability}</td>
        <td style="text-align:center">${r.impact}</td>
        <td style="text-align:center;font-weight:bold;color:${this.getRiskColor(r.riskScore ?? 0)}">${r.riskScore}</td>
        <td>${r.riskLevel}</td>
        <td>${r.responseType ?? 'Mitigate'}</td>
        <td>${r.status}</td>
        <td>${r.owner ?? ''}</td>
        <td style="font-size:11px">${r.mitigationStrategy ?? ''}</td>
        <td style="font-size:11px">${r.targetDate ? new Date(r.targetDate).toLocaleDateString() : '—'}</td>
      </tr>`).join('');

    w.document.write(`<!DOCTYPE html><html><head><title>Risk Report — ${p.name}</title>
      <style>body{font-family:Arial,sans-serif;padding:20px;color:#333}
      h1{color:#1a1f2e;border-bottom:3px solid #f7c948;padding-bottom:8px}
      .meta{color:#666;margin-bottom:20px;font-size:13px}
      table{width:100%;border-collapse:collapse;font-size:12px}
      th{background:#1a1f2e;color:#f7c948;padding:8px 6px;text-align:left}
      td{padding:7px 6px;vertical-align:top}
      tr:nth-child(even){background:#f9f9f9}
      .footer{margin-top:30px;font-size:11px;color:#999;border-top:1px solid #ddd;padding-top:10px}
      @media print{button{display:none}}</style></head>
      <body>
      <h1>Risk Register Report</h1>
      <div class="meta"><strong>Project:</strong> ${p.name} &nbsp;|&nbsp;
        <strong>Total:</strong> ${this.risks.length} risks &nbsp;|&nbsp;
        <strong>Critical:</strong> ${this.criticalCount} &nbsp;|&nbsp;
        <strong>Generated:</strong> ${new Date().toLocaleDateString()}</div>
      <table><thead><tr>
        <th>Risk Title</th><th>Category</th><th>P</th><th>I</th>
        <th>Score</th><th>Level</th><th>Response</th><th>Status</th>
        <th>Owner</th><th>Mitigation Strategy</th><th>Target Date</th>
      </tr></thead><tbody>${rows}</tbody></table>
      <div class="footer">BuildMaster CMS — Risk Management Report &nbsp;|&nbsp; ${p.name}</div>
      <br><button onclick="window.print()">🖨️ Print / Save as PDF</button>
      </body></html>`);
    w.document.close();
  }
}
