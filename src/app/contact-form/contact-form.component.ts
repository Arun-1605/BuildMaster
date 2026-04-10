import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { API_URLS } from '../core/constants';

@Component({
  selector: 'app-contact-form',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule],
  templateUrl: './contact-form.component.html',
  styleUrls: ['./contact-form.component.css'],
})
export class ContactFormComponent implements OnInit {
  @Output() close = new EventEmitter<void>();

  contactForm!: FormGroup;
  submitting = false;
  submitSuccess = false;
  submitError = false;

  countries: any[] = [];
  states: any[] = [];

  constructor(private fb: FormBuilder, private http: HttpClient) {}

  ngOnInit(): void {
    this.contactForm = this.fb.group({
      firstName: ['', [Validators.required, Validators.minLength(2)]],
      lastName: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],
      phone: ['', [Validators.required, Validators.pattern(/^\d{10}$/)]],
      country: ['', Validators.required],
      state: ['', Validators.required],
      message: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(500)]],
    });

    this.loadCountries();

    this.contactForm.get('country')?.valueChanges.subscribe((selectedCountryCode) => {
      const selectedCountry = this.countries.find(c => c.countryCode === selectedCountryCode);
      this.states = selectedCountry ? selectedCountry.states : [];
      this.contactForm.get('state')?.reset();
    });
  }

  loadCountries(): void {
    this.http.get<any[]>(API_URLS.COUNTRYWITHSTATES).subscribe({
      next: (data) => this.countries = data,
      error: (error) => console.error('Error fetching countries:', error)
    });
  }

  hasError(controlName: string, errorName: string): boolean {
    const control = this.contactForm.get(controlName);
    return !!control?.touched && control.hasError(errorName);
  }

  onSubmit(): void {
    if (this.contactForm.invalid) return;

    this.submitting = true;
    this.submitSuccess = false;
    this.submitError = false;

    const formData = {
      id: 0,
      firstName: this.contactForm.get('firstName')?.value,
      lastName: this.contactForm.get('lastName')?.value,
      emailaddress: this.contactForm.get('email')?.value,
      mobile: this.contactForm.get('phone')?.value,
      message: this.contactForm.get('message')?.value,
      countryId: this.countries.find(c => c.countryCode === this.contactForm.get('country')?.value)?.countryId || 0,
      stateId: this.contactForm.get('state')?.value,
    };

    this.http.post(API_URLS.ENQUIRY, formData).subscribe({
      next: () => {
        this.submitting = false;
        this.submitSuccess = true;
        this.contactForm.reset();
      },
      error: (error) => {
        console.error('Error submitting form:', error);
        this.submitting = false;
        this.submitError = true;
      }
    });
  }

  onCancel(): void {
    this.contactForm.reset();
    this.submitSuccess = false;
    this.submitError = false;
    this.close.emit();
  }

  onClose(): void {
    this.close.emit(); // Notify the parent component to close the form
  }
}