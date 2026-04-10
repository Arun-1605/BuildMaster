import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { API_URLS } from '../core/constants';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

@Component({
  selector: 'app-ai-assistant',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ai-assistant.component.html',
  styleUrls: ['./ai-assistant.component.css']
})
export class AiAssistantComponent implements OnInit {
  @ViewChild('chatContainer') chatContainer!: ElementRef;

  messages: ChatMessage[] = [];
  userInput = '';
  isLoading = false;
  isOllamaOnline = false;

  quickTopics = [
    { label: 'Foundation Best Practices', value: 'foundation' },
    { label: 'Concrete Quality Checks', value: 'concrete' },
    { label: 'Site Safety Protocols', value: 'safety' },
    { label: 'Cost Estimation Guide', value: 'estimation' },
    { label: 'Construction Schedule', value: 'schedule' },
    { label: 'OPC vs PPC Cement', value: 'materials' },
    { label: 'Waterproofing Techniques', value: 'waterproofing' },
    { label: 'Steel Reinforcement', value: 'steel' },
    { label: 'Quality Tests (RCC)', value: 'quality' },
    { label: 'Vastu for Construction', value: 'vastu' },
  ];

  constructor(private http: HttpClient) {}

  ngOnInit() {
    if (typeof window !== 'undefined') this.checkOllamaStatus();
    this.messages.push({
      role: 'assistant',
      content: `Welcome! I'm your AI Construction Management Assistant powered by Ollama (local AI).

I can help you with:
• **Project Planning** — phases, scheduling, milestones
• **Cost Estimation** — BOQ, material quantities, labour costs
• **Risk Management** — identify and mitigate construction risks
• **Technical Advice** — foundation, structure, MEP, finishes
• **Materials** — selection, specifications, quality standards
• **Regulations** — building codes, safety, approvals

Ask me anything about construction! Use the quick topic buttons below to get started.`,
      timestamp: new Date()
    });
  }

  checkOllamaStatus() {
    this.http.post<any>(API_URLS.AI_CHAT, { message: 'hi', history: [] })
      .subscribe({
        next: () => { this.isOllamaOnline = true; },
        error: () => { this.isOllamaOnline = false; }
      });
  }

  sendMessage() {
    const msg = this.userInput.trim();
    if (!msg || this.isLoading) return;

    this.messages.push({ role: 'user', content: msg, timestamp: new Date() });
    this.userInput = '';
    this.isLoading = true;
    this.scrollToBottom();

    const history = this.messages.slice(0, -1).map(m => ({
      role: m.role,
      content: m.content
    }));

    this.http.post<any>(API_URLS.AI_CHAT, { message: msg, history })
      .subscribe({
        next: (res) => {
          this.messages.push({ role: 'assistant', content: res.message, timestamp: new Date() });
          this.isLoading = false;
          this.scrollToBottom();
        },
        error: (err) => {
          this.messages.push({
            role: 'assistant',
            content: 'Ollama is not reachable. Please ensure Ollama is running: `ollama serve` and a model is pulled: `ollama pull llama3`',
            timestamp: new Date()
          });
          this.isLoading = false;
          this.scrollToBottom();
        }
      });
  }

  askQuickTopic(topic: string) {
    this.http.post<any>(`${API_URLS.AI_QUICK_ADVICE}?topic=${topic}`, {})
      .subscribe({
        next: (res) => {
          this.messages.push({ role: 'user', content: `Tell me about: ${topic}`, timestamp: new Date() });
          this.messages.push({ role: 'assistant', content: res.message, timestamp: new Date() });
          this.scrollToBottom();
        },
        error: () => {
          this.messages.push({
            role: 'assistant',
            content: 'Could not reach Ollama. Please start Ollama first.',
            timestamp: new Date()
          });
        }
      });
  }

  clearChat() {
    this.messages = this.messages.slice(0, 1); // keep welcome message
  }

  onEnter(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  scrollToBottom() {
    setTimeout(() => {
      if (this.chatContainer) {
        this.chatContainer.nativeElement.scrollTop = this.chatContainer.nativeElement.scrollHeight;
      }
    }, 100);
  }

  formatMessage(content: string): string {
    return content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
  }
}
