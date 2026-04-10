import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_URLS } from '../core/constants';

export interface QuotationSummary {
  id: number;
  rfqNumber: string;
  projectName: string;
  requestDate: string;
  requiredByDate: string;
  status: string;
  subject: string;
  totalBudget: number;
  createdBy: string;
  itemCount: number;
  supplierCount: number;
  responseCount: number;
  lowestOffer: number;
  highestOffer: number;
}

export interface QuotationItem {
  id: number;
  materialId: number;
  materialName: string;
  description: string;
  quantity: number;
  unit: string;
  targetPrice: number;
  specifications: string;
}

export interface QuotationResponseItem {
  quotationItemId: number;
  materialName: string;
  offeredPrice: number;
  offeredQuantity: number;
  unit: string;
  taxPercentage: number;
  totalAmount: number;
}

export interface QuotationResponse {
  id: number;
  supplierId: number;
  companyName: string;
  responseDate: string;
  totalOfferedAmount: number;
  validUntil: string;
  leadTimeDays: number;
  deliveryTerms: string;
  paymentTerms: string;
  supplierComments: string;
  receivedVia: string;
  isSelected: boolean;
  items: QuotationResponseItem[];
}

export interface QuotationSupplierDto {
  id: number;
  supplierId: number;
  companyName: string;
  contactPerson: string;
  email: string;
  whatsAppNumber: string;
  sentVia: string;
  sentAt: string;
  status: string;
  isSelected: boolean;
  response: QuotationResponse | null;
}

export interface QuotationRequest {
  id: number;
  rfqNumber: string;
  projectId: number;
  projectName: string;
  requestDate: string;
  requiredByDate: string;
  status: string;
  subject: string;
  notes: string;
  totalBudget: number;
  deliveryAddress: string;
  createdBy: string;
  createdAt: string;
  items: QuotationItem[];
  suppliers: QuotationSupplierDto[];
}

export interface CreateQuotationDto {
  projectId?: number;
  projectName: string;
  requiredByDate?: string;
  subject: string;
  notes: string;
  totalBudget?: number;
  deliveryAddress: string;
  createdBy: string;
  items: {
    materialId?: number;
    materialName: string;
    description: string;
    quantity: number;
    unit: string;
    targetPrice?: number;
    specifications: string;
  }[];
  supplierIds: number[];
}

export interface SendQuotationDto {
  quotationRequestId: number;
  supplierIds: number[];
  sendVia: 'Email' | 'WhatsApp' | 'Both';
}

export interface SubmitResponseDto {
  quotationSupplierId: number;
  quotationRequestId: number;
  supplierId: number;
  totalOfferedAmount?: number;
  validUntil?: string;
  leadTimeDays?: number;
  deliveryTerms: string;
  paymentTerms: string;
  supplierComments: string;
  receivedVia: string;
  items: {
    quotationItemId: number;
    offeredPrice: number;
    offeredQuantity: number;
    unit: string;
    taxPercentage: number;
  }[];
}

@Injectable({ providedIn: 'root' })
export class QuotationService {
  constructor(private http: HttpClient) {}

  getAll(): Observable<QuotationSummary[]> {
    return this.http.get<QuotationSummary[]>(API_URLS.QUOTATIONS);
  }

  getById(id: number): Observable<QuotationRequest> {
    return this.http.get<QuotationRequest>(`${API_URLS.QUOTATIONS}/${id}`);
  }

  create(dto: CreateQuotationDto): Observable<QuotationRequest> {
    return this.http.post<QuotationRequest>(API_URLS.QUOTATIONS, dto);
  }

  send(dto: SendQuotationDto): Observable<any> {
    return this.http.post(API_URLS.QUOTATION_SEND, dto);
  }

  submitResponse(dto: SubmitResponseDto): Observable<any> {
    return this.http.post(API_URLS.QUOTATION_RESPONSE, dto);
  }

  selectSupplier(quotationRequestId: number, supplierId: number, reason: string): Observable<any> {
    return this.http.post(API_URLS.QUOTATION_SELECT, { quotationRequestId, supplierId, selectionReason: reason });
  }
}
