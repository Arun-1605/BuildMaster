import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OllamaSetupService, OllamaHealth } from '../service/ollama-setup.service';

@Component({
  selector: 'app-ollama-setup',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ollama-setup.component.html',
  styleUrls: ['./ollama-setup.component.css']
})
export class OllamaSetupComponent implements OnInit {
  health: OllamaHealth | null = null;
  showDetails = false;
  rechecking = false;
  dismissed = false;

  constructor(private ollamaSetup: OllamaSetupService) {}

  ngOnInit() {
    this.ollamaSetup.health$.subscribe(h => {
      this.health = h;
      if (h?.isOnline) this.dismissed = false;
      this.rechecking = false;
    });
  }

  recheck() {
    this.rechecking = true;
    this.ollamaSetup.recheck();
  }

  get os(): 'windows' | 'mac' | 'linux' {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('win')) return 'windows';
    if (ua.includes('mac')) return 'mac';
    return 'linux';
  }

  get downloadUrl(): string {
    if (!this.health?.setupGuide) return 'https://ollama.com';
    const g = this.health.setupGuide;
    return this.os === 'windows' ? g.windows : this.os === 'mac' ? g.mac : 'https://ollama.com';
  }

  get linuxCmd(): string {
    return this.health?.setupGuide?.linux ?? 'curl -fsSL https://ollama.com/install.sh | sh';
  }

  get pullCmd(): string {
    return this.health?.setupGuide?.pullModel ?? 'ollama pull llama3';
  }
}
