import { Injectable, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, interval, switchMap, startWith } from 'rxjs';
import { API_URLS } from '../core/constants';

export interface OllamaHealth {
  isOnline: boolean;
  baseUrl: string;
  model: string;
  availableModels: string[];
  setupGuide: {
    windows: string;
    mac: string;
    linux: string;
    pullModel: string;
    startServer: string;
  };
}

const OFFLINE_DEFAULT: OllamaHealth = {
  isOnline: false, baseUrl: '', model: '', availableModels: [],
  setupGuide: {
    windows: 'https://ollama.com/download/OllamaSetup.exe',
    mac: 'https://ollama.com/download/Ollama-darwin.zip',
    linux: 'curl -fsSL https://ollama.com/install.sh | sh',
    pullModel: 'ollama pull llama3',
    startServer: 'ollama serve'
  }
};

@Injectable({ providedIn: 'root' })
export class OllamaSetupService {
  private _health = new BehaviorSubject<OllamaHealth | null>(null);
  readonly health$ = this._health.asObservable();

  constructor(
    private http: HttpClient,
    @Inject(PLATFORM_ID) private platformId: object
  ) {
    if (isPlatformBrowser(this.platformId)) {
      interval(30_000).pipe(
        startWith(0),
        switchMap(() => this.http.get<OllamaHealth>(API_URLS.AI_OLLAMA_HEALTH))
      ).subscribe({
        next: h => this._health.next(h),
        error: () => this._health.next(OFFLINE_DEFAULT)
      });
    }
  }

  recheck() {
    if (!isPlatformBrowser(this.platformId)) return;
    this.http.get<OllamaHealth>(API_URLS.AI_OLLAMA_HEALTH).subscribe({
      next: h => this._health.next(h),
      error: () => {}
    });
  }

  get isOnline(): boolean {
    return this._health.value?.isOnline ?? false;
  }
}
