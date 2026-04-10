import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_URLS } from '../core/constants';
import { CommonModule } from '@angular/common';

interface Material {
  materialId: number;
  materialName: string;
  materialDescription: string;
  productGroupId: number;
  productGroup: string;
}

@Component({
  selector: 'app-materials',
  standalone: true,
  templateUrl: './materials.component.html',
  styleUrls: ['./materials.component.css'],
  imports: [CommonModule]
})
export class MaterialsComponent implements OnInit {
  materials: Material[] = [];
  loading = false;
  error: string | null = null;

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.fetchMaterials();
  }

  fetchMaterials() {
    this.loading = true;
    this.error = null;
    this.http.get<Material[]>(API_URLS.GETALLMATERIALS).subscribe({
      next: (data) => {
        this.materials = data;
        this.loading = false;
      },
      error: (err) => {
        this.error = 'Failed to load materials.';
        this.loading = false;
      }
    });
  }
}