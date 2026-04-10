import { Component } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { API_URLS } from '../core/constants';

@Component({
  selector: 'app-prompt-form',
  standalone: true,
  imports: [FormsModule, CommonModule], // Add CommonModule here
  templateUrl: './prompt-form.component.html',
  styleUrls: ['./prompt-form.component.css'],
})
export class PromptFormComponent {
  userPrompt = ''; // Stores the user's input
  generatedPlan: string | null = null; // Stores the generated output (text or image)

  constructor(private http: HttpClient) {}

  // Call the backend API to generate the output
  generatePlan() {
    const apiUrl = API_URLS.GENERATE_PLAN;

    const payload = {
      userInputId: 0,
      description: this.userPrompt,
    };

    this.http.post(apiUrl, payload, { responseType: 'text' })
      .subscribe({
        next: (response: string) => {
          this.generatedPlan = response; // Store the response (text or image URL)
        },
        error: (err) => {
          console.error('Error generating plan:', err);
          alert('Failed to generate the output. Please try again.');
        }
      });
  }

  // Check if the output is an image URL
  isImage(output: string): boolean {
    return output.startsWith('http') && (output.endsWith('.jpg') || output.endsWith('.png') || output.endsWith('.jpeg'));
  }
}