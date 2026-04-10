import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_URLS } from '../core/constants';

export interface Supplier {
  id: number;
  supplierCode: string;
  companyName: string;
  contactPerson: string;
  category: string;
  email: string;
  whatsAppNumber: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  country: string;
  gstNumber: string;
  pan: string;
  bankName: string;
  accountNumber: string;
  ifsc: string;
  rating: number;
  totalOrders: number;
  notes: string;
  isActive: boolean;
  createdAt: string;
}

export interface CreateSupplierDto {
  companyName: string;
  contactPerson: string;
  category: string;
  email: string;
  whatsAppNumber: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  country: string;
  gstNumber: string;
  pan: string;
  bankName: string;
  accountNumber: string;
  ifsc: string;
  notes: string;
}

@Injectable({ providedIn: 'root' })
export class SupplierService {
  constructor(private http: HttpClient) {}

  getAll(): Observable<Supplier[]> {
    return this.http.get<Supplier[]>(API_URLS.SUPPLIERS);
  }

  getAllActive(): Observable<Supplier[]> {
    return this.http.get<Supplier[]>(API_URLS.SUPPLIER_ACTIVE);
  }

  getCategories(): Observable<string[]> {
    return this.http.get<string[]>(API_URLS.SUPPLIER_CATEGORIES);
  }

  getByCategory(category: string): Observable<Supplier[]> {
    return this.http.get<Supplier[]>(`${API_URLS.SUPPLIER_BY_CATEGORY}/${category}`);
  }

  getById(id: number): Observable<Supplier> {
    return this.http.get<Supplier>(`${API_URLS.SUPPLIERS}/${id}`);
  }

  create(dto: CreateSupplierDto): Observable<Supplier> {
    return this.http.post<Supplier>(API_URLS.SUPPLIERS, dto);
  }

  update(id: number, dto: CreateSupplierDto & { isActive: boolean }): Observable<Supplier> {
    return this.http.put<Supplier>(`${API_URLS.SUPPLIERS}/${id}`, dto);
  }

  toggleActive(id: number): Observable<{ id: number; isActive: boolean }> {
    return this.http.patch<{ id: number; isActive: boolean }>(
      `${API_URLS.SUPPLIERS}/${id}/toggle`, {}
    );
  }

  rate(id: number, rating: number): Observable<void> {
    return this.http.post<void>(`${API_URLS.SUPPLIER_RATE}/${id}/rate`, { rating });
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${API_URLS.SUPPLIERS}/${id}`);
  }
}
