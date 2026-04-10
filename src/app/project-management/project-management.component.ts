import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
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
  phases?: Phase[];
}

interface Phase {
  id?: number;
  projectId: number;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  progress: number;
  status: string;
  order: number;
  tasks?: Task[];
}

interface Task {
  id?: number;
  phaseId: number;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  status: string;
  assignedTo: string;
  priority: number;
  notes: string;
}

@Component({
  selector: 'app-project-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './project-management.component.html',
  styleUrls: ['./project-management.component.css']
})
export class ProjectManagementComponent implements OnInit {
  projects: Project[] = [];
  selectedProject: Project | null = null;
  showProjectForm = false;
  showPhaseForm = false;
  showTaskForm = false;
  showAIPlanResult = false;
  isLoading = false;
  isSaving = false;
  isGeneratingAIPlan = false;
  aiPlanResult = '';
  errorMsg = '';
  successMsg = '';

  projectForm: Project = this.emptyProject();
  phaseForm: Phase = this.emptyPhase();
  taskForm: Task = this.emptyTask();
  editingProjectId: number | null = null;
  editingPhaseId: number | null = null;
  editingTaskId: number | null = null;

  // Tab in detail panel
  detailTab: 'phases' | 'gantt' | 'documents' = 'phases';

  // Documents
  documents: { id: number; fileName: string; fileSize: number; contentType: string; description?: string; uploadedAt: string; sizeDisplay: string }[] = [];
  docLoading = false;
  docUploadDesc = '';
  docError = '';

  projectTypes = ['Residential', 'Commercial', 'Industrial', 'Infrastructure', 'Renovation'];
  statusOptions = ['Planning', 'InProgress', 'OnHold', 'Completed'];
  phaseStatuses = ['Pending', 'InProgress', 'Completed', 'OnHold'];
  taskStatuses = ['Pending', 'InProgress', 'Completed', 'Blocked'];
  priorities = [{ value: 1, label: 'High' }, { value: 2, label: 'Medium' }, { value: 3, label: 'Low' }];

  defaultPhases = [
    'Design & Approvals', 'Site Preparation', 'Foundation',
    'Structural Work', 'MEP Works', 'Interior Finishes',
    'External Works', 'Inspection & Handover'
  ];

  constructor(private http: HttpClient) {}

  ngOnInit() { this.loadProjects(); }

  loadProjects() {
    this.isLoading = true;
    this.errorMsg = '';
    this.http.get<Project[]>(API_URLS.PROJECTS).subscribe({
      next: (data) => { this.projects = data; this.isLoading = false; },
      error: (err) => { this.isLoading = false; this.errorMsg = err.status === 401 ? 'Session expired. Please log in again.' : 'Failed to load projects.'; }
    });
  }

  selectProject(p: Project) {
    this.selectedProject = p;
    this.detailTab = 'phases';
    if (p.id) {
      this.http.get<Project>(`${API_URLS.PROJECTS}/${p.id}`).subscribe({
        next: (full) => { this.selectedProject = full; }
      });
      this.loadDocuments(p.id);
    }
  }

  // ── Gantt Helpers ─────────────────────────────────────────────────────────

  ganttStart(p: Project): Date {
    return p.startDate ? new Date(p.startDate) : new Date();
  }

  ganttEnd(p: Project): Date {
    if (p.endDate) return new Date(p.endDate);
    const phases = p.phases ?? [];
    const ends = phases.map(ph => ph.endDate ? new Date(ph.endDate).getTime() : 0).filter(t => t > 0);
    if (ends.length) return new Date(Math.max(...ends));
    const d = new Date(this.ganttStart(p));
    d.setFullYear(d.getFullYear() + 1);
    return d;
  }

  ganttBarStyle(phase: Phase, project: Project): { left: string; width: string; background: string } {
    const start  = this.ganttStart(project).getTime();
    const end    = this.ganttEnd(project).getTime();
    const total  = end - start || 1;
    const ps     = phase.startDate ? new Date(phase.startDate).getTime() : start;
    const pe     = phase.endDate   ? new Date(phase.endDate).getTime()   : ps + 86400000 * 14;
    const left   = Math.max(0, ((ps - start) / total) * 100);
    const width  = Math.max(1, ((pe - ps) / total) * 100);
    const colors: Record<string, string> = {
      Pending: '#475569', InProgress: '#f59e0b', Completed: '#22c55e', OnHold: '#6b7280'
    };
    return { left: `${left}%`, width: `${width}%`, background: colors[phase.status] ?? '#475569' };
  }

  ganttMonthLabels(project: Project): { label: string; left: string }[] {
    const start  = this.ganttStart(project);
    const end    = this.ganttEnd(project);
    const total  = end.getTime() - start.getTime() || 1;
    const labels: { label: string; left: string }[] = [];
    const cur = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cur <= end) {
      const left = Math.max(0, ((cur.getTime() - start.getTime()) / total) * 100);
      labels.push({ label: cur.toLocaleString('default', { month: 'short', year: '2-digit' }), left: `${left}%` });
      cur.setMonth(cur.getMonth() + 1);
    }
    return labels;
  }

  exportPhasesCsv(): void {
    if (!this.selectedProject?.phases?.length) return;
    const rows = [
      ['Phase', 'Status', 'Progress %', 'Start Date', 'End Date'],
      ...this.selectedProject.phases.map(ph => [
        ph.name, ph.status, ph.progress.toString(),
        ph.startDate?.substring(0, 10) ?? '', ph.endDate?.substring(0, 10) ?? ''
      ])
    ];
    const csv  = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const url  = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a    = Object.assign(document.createElement('a'), { href: url, download: `phases-${this.selectedProject.name}.csv` });
    a.click(); URL.revokeObjectURL(url);
  }

  // ── Documents ──────────────────────────────────────────────────────────────

  loadDocuments(projectId: number): void {
    this.docLoading = true;
    this.http.get<any[]>(`${API_URLS.PROJECT_DOCUMENTS}/project/${projectId}`).subscribe({
      next:  docs => { this.documents = docs; this.docLoading = false; },
      error: ()   => { this.docLoading = false; }
    });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length || !this.selectedProject?.id) return;
    const file = input.files[0];
    const maxMb = 50;
    if (file.size > maxMb * 1024 * 1024) {
      this.docError = `File too large. Maximum size is ${maxMb} MB.`; return;
    }
    this.docError = '';
    const form = new FormData();
    form.append('file', file);
    if (this.docUploadDesc) form.append('description', this.docUploadDesc);

    this.docLoading = true;
    this.http.post<any>(`${API_URLS.PROJECT_DOCUMENTS}/project/${this.selectedProject.id}`, form).subscribe({
      next: doc => {
        this.documents.unshift(doc);
        this.docLoading    = false;
        this.docUploadDesc = '';
        this.successMsg    = 'File uploaded.';
        input.value = '';
        setTimeout(() => this.successMsg = '', 3000);
      },
      error: err => {
        this.docLoading = false;
        this.docError   = err.error?.message ?? 'Upload failed.';
      }
    });
  }

  downloadDocument(doc: any): void {
    this.http.get(`${API_URLS.PROJECT_DOCUMENTS}/${doc.id}/download`,
      { responseType: 'blob' }
    ).subscribe(blob => {
      const url = URL.createObjectURL(blob);
      const a   = Object.assign(document.createElement('a'), { href: url, download: doc.fileName });
      a.click(); URL.revokeObjectURL(url);
    });
  }

  deleteDocument(id: number): void {
    if (!confirm('Delete this file?')) return;
    this.http.delete(`${API_URLS.PROJECT_DOCUMENTS}/${id}`).subscribe({
      next: () => { this.documents = this.documents.filter(d => d.id !== id); }
    });
  }

  docIcon(ct: string): string {
    if (ct.includes('pdf')) return '📄';
    if (ct.includes('image')) return '🖼️';
    if (ct.includes('sheet') || ct.includes('excel') || ct.includes('csv')) return '📊';
    if (ct.includes('word') || ct.includes('document')) return '📝';
    if (ct.includes('zip') || ct.includes('rar')) return '🗜️';
    return '📎';
  }

  openCreateProject() {
    console.log('Opening create project modal');
    this.projectForm = this.emptyProject();
    this.editingProjectId = null;
    this.errorMsg = '';
    this.showProjectForm = true;
  }

  editProject(p: Project) {
    this.projectForm = { ...p, startDate: p.startDate?.substring(0, 10), endDate: p.endDate?.substring(0, 10) };
    this.editingProjectId = p.id!;
    this.showProjectForm = true;
  }

  saveProject() {
    this.errorMsg = '';

    if (!this.projectForm.name?.trim()) { this.errorMsg = 'Project name is required.'; return; }
    if (!this.projectForm.startDate) { this.errorMsg = 'Start date is required.'; return; }

    this.isSaving = true;

    // Build a clean payload — convert empty date strings to null so .NET can deserialize them
    const payload = {
      name:        this.projectForm.name,
      description: this.projectForm.description,
      clientName:  this.projectForm.clientName,
      location:    this.projectForm.location,
      startDate:   this.projectForm.startDate || null,
      endDate:     this.projectForm.endDate   || null,
      budget:      this.projectForm.budget,
      status:      this.projectForm.status,
      projectType: this.projectForm.projectType,
      totalArea:   this.projectForm.totalArea,
      floors:      this.projectForm.floors
    };

    const done = () => {
      this.isSaving = false;
      this.loadProjects();
      this.showProjectForm = false;
      this.successMsg = 'Project saved successfully.';
      setTimeout(() => this.successMsg = '', 3000);
    };
    const fail = (err: any) => {
      this.isSaving = false;
      this.errorMsg = err.error?.message || err.error?.title || (err.status === 400 ? 'Please fill all required fields correctly.' : 'Failed to save project. Please try again.');
      if (err.error?.errors) {
        const errors = Object.values(err.error.errors).flat();
        this.errorMsg += ' ' + errors.join(' ');
      }
    };

    if (this.editingProjectId) {
      this.http.put<Project>(`${API_URLS.PROJECTS}/${this.editingProjectId}`, payload).subscribe({ next: done, error: fail });
    } else {
      this.http.post<Project>(API_URLS.PROJECTS, payload).subscribe({ next: done, error: fail });
    }
  }

  deleteProject(id: number) {
    if (!confirm('Delete this project and all its data?')) return;
    this.http.delete(`${API_URLS.PROJECTS}/${id}`).subscribe({
      next: () => {
        this.loadProjects();
        if (this.selectedProject?.id === id) this.selectedProject = null;
      }
    });
  }

  generateAIPlan() {
    if (!this.selectedProject) return;
    this.isGeneratingAIPlan = true;
    this.showAIPlanResult = false;

    const req = {
      projectName: this.selectedProject.name,
      projectType: this.selectedProject.projectType,
      description: this.selectedProject.description,
      totalArea: this.selectedProject.totalArea,
      floors: this.selectedProject.floors,
      startDate: this.selectedProject.startDate,
      budget: this.selectedProject.budget,
      location: this.selectedProject.location
    };

    this.http.post<any>(API_URLS.PROJECT_AI_PLAN, req).subscribe({
      next: (res) => {
        this.aiPlanResult = res.plan;
        this.isGeneratingAIPlan = false;
        this.showAIPlanResult = true;
      },
      error: () => {
        this.aiPlanResult = 'Could not generate plan. Ensure Ollama is running.';
        this.isGeneratingAIPlan = false;
        this.showAIPlanResult = true;
      }
    });
  }

  addDefaultPhases() {
    if (!this.selectedProject?.id) return;
    this.defaultPhases.forEach((name, i) => {
      const start = new Date(this.selectedProject!.startDate);
      start.setDate(start.getDate() + i * 14);
      const end = new Date(start);
      end.setDate(end.getDate() + 13);
      const phase: Phase = {
        projectId: this.selectedProject!.id!,
        name, description: '', progress: 0, status: 'Pending', order: i + 1,
        startDate: start.toISOString().substring(0, 10),
        endDate: end.toISOString().substring(0, 10)
      };
      this.http.post<Phase>(API_URLS.PROJECT_PHASES, phase).subscribe({
        next: () => { if (i === this.defaultPhases.length - 1) this.selectProject(this.selectedProject!); }
      });
    });
  }

  openAddPhase() {
    this.phaseForm = this.emptyPhase();
    this.phaseForm.projectId = this.selectedProject!.id!;
    this.phaseForm.order = (this.selectedProject?.phases?.length ?? 0) + 1;
    this.editingPhaseId = null;
    this.showPhaseForm = true;
  }

  editPhase(ph: Phase) {
    this.phaseForm = { ...ph, startDate: ph.startDate?.substring(0, 10), endDate: ph.endDate?.substring(0, 10) };
    this.editingPhaseId = ph.id!;
    this.showPhaseForm = true;
  }

  savePhase() {
    const payload = {
      ...this.phaseForm,
      startDate: this.phaseForm.startDate || null,
      endDate:   this.phaseForm.endDate   || null
    };
    const done = () => { this.selectProject(this.selectedProject!); this.showPhaseForm = false; };
    if (this.editingPhaseId) {
      this.http.put<Phase>(`${API_URLS.PROJECT_PHASES}/${this.editingPhaseId}`, payload).subscribe({ next: done });
    } else {
      this.http.post<Phase>(API_URLS.PROJECT_PHASES, payload).subscribe({ next: done });
    }
  }

  deletePhase(id: number) {
    if (!confirm('Delete this phase?')) return;
    this.http.delete(`${API_URLS.PROJECT_PHASES}/${id}`).subscribe({
      next: () => this.selectProject(this.selectedProject!)
    });
  }

  openAddTask(phaseId: number) {
    this.taskForm = this.emptyTask();
    this.taskForm.phaseId = phaseId;
    this.editingTaskId = null;
    this.showTaskForm = true;
  }

  editTask(t: Task) {
    this.taskForm = { ...t, startDate: t.startDate?.substring(0, 10), endDate: t.endDate?.substring(0, 10) };
    this.editingTaskId = t.id!;
    this.showTaskForm = true;
  }

  saveTask() {
    const payload = {
      ...this.taskForm,
      startDate: this.taskForm.startDate || null,
      endDate:   this.taskForm.endDate   || null
    };
    const done = () => { this.selectProject(this.selectedProject!); this.showTaskForm = false; };
    if (this.editingTaskId) {
      this.http.put<Task>(`${API_URLS.PROJECT_TASKS}/${this.editingTaskId}`, payload).subscribe({ next: done });
    } else {
      this.http.post<Task>(API_URLS.PROJECT_TASKS, payload).subscribe({ next: done });
    }
  }

  deleteTask(id: number) {
    if (!confirm('Delete this task?')) return;
    this.http.delete(`${API_URLS.PROJECT_TASKS}/${id}`).subscribe({
      next: () => this.selectProject(this.selectedProject!)
    });
  }

  getProgressColor(p: number): string {
    if (p >= 80) return '#22c55e';
    if (p >= 50) return '#f59e0b';
    if (p >= 20) return '#3b82f6';
    return '#ef4444';
  }

  getStatusBadge(s: string): string {
    const map: Record<string, string> = {
      Planning: 'badge-blue', InProgress: 'badge-yellow',
      Completed: 'badge-green', OnHold: 'badge-gray',
      Pending: 'badge-gray', Blocked: 'badge-red'
    };
    return map[s] ?? 'badge-gray';
  }

  emptyProject(): Project {
    return { name: '', description: '', clientName: '', location: '', startDate: '', endDate: '', budget: 0, status: 'Planning', projectType: 'Residential', totalArea: 0, floors: 1 };
  }
  emptyPhase(): Phase {
    return { projectId: 0, name: '', description: '', startDate: '', endDate: '', progress: 0, status: 'Pending', order: 1 };
  }
  emptyTask(): Task {
    return { phaseId: 0, name: '', description: '', startDate: '', endDate: '', status: 'Pending', assignedTo: '', priority: 2, notes: '' };
  }
}
