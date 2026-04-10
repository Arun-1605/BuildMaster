import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router, RouterModule } from '@angular/router';
import { API_URLS } from '../core/constants';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface MaterialPrice {
  id: number;
  materialId: number;
  materialName: string;
  districtName: string;
  country: string;        // <-- property is 'country'
  stateName: string;
  price: number;
  pricedate: string;      // <-- property is 'pricedate'
}

@Component({
  selector: 'app-location-material-price-list',
  templateUrl: './location-material-price-list.component.html',
  styleUrls: ['./location-material-price-list.component.css'],
  standalone: true,
  imports: [RouterModule, CommonModule, FormsModule]
})
export class LocationMaterialPriceListComponent implements OnInit {
  materialPrices: MaterialPrice[] = [];
  filteredPrices: MaterialPrice[] = [];
  loading = true;
  error = false;

  selectedPrice: MaterialPrice | null = null;
  showDeleteConfirmation = false;

  searchTerm = '';
  sortColumn = 'pricedate';
  sortDirection: 'asc' | 'desc' = 'desc';

  currentPage = 1;
  pageSize = 10;
  totalPages = 1;

  constructor(
    private http: HttpClient,
    private router: Router
  ) { }

  ngOnInit(): void {
    this.loadMaterialPrices();
  }

  loadMaterialPrices(): void {
    this.loading = true;
    this.error = false;

    this.http.get<MaterialPrice[]>(API_URLS.GETALLMATERIALPRICE).subscribe({
      next: (data) => {
        this.materialPrices = data;
        this.applyFilters();
        this.loading = false;
      },
      error: (err) => {
        console.error('Failed to load material prices', err);
        this.loading = false;
        this.error = true;
      }
    });
  }

  // id: number is the ID of the material price you want to update
  updateMaterialPrice(id: number, updatedData: any) {
    const url = `${API_URLS.UPDATEMATERIALPRICE}/${id}`;
    this.http.put(url, updatedData).subscribe({
      next: () => {
        alert('Material price updated!');
        this.loadMaterialPrices?.();
      },
      error: () => alert('Failed to update material price.')
    });
  }

  filterItems(): void {
    this.currentPage = 1;
    this.applyFilters();
  }

  applyFilters(): void {
    let result = [...this.materialPrices];

    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      result = result.filter(price =>
        price.materialName.toLowerCase().includes(term) ||
        price.country.toLowerCase().includes(term) ||
        price.stateName.toLowerCase().includes(term) ||
        price.districtName.toLowerCase().includes(term) ||
        price.price.toString().includes(term) ||
        new Date(price.pricedate).toLocaleDateString().includes(term)
      );
    }

    result = this.sortData(result);

    this.totalPages = Math.ceil(result.length / this.pageSize);

    const startIndex = (this.currentPage - 1) * this.pageSize;
    this.filteredPrices = result.slice(startIndex, startIndex + this.pageSize);
  }

  sortData(data: MaterialPrice[]): MaterialPrice[] {
    return data.sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (this.sortColumn) {
        case 'materialName':
          aValue = a.materialName;
          bValue = b.materialName;
          break;
        case 'country':
          aValue = a.country;
          bValue = b.country;
          break;
        case 'stateName':
          aValue = a.stateName;
          bValue = b.stateName;
          break;
        case 'districtName':
          aValue = a.districtName;
          bValue = b.districtName;
          break;
        case 'price':
          aValue = a.price;
          bValue = b.price;
          break;
        case 'pricedate':
          aValue = new Date(a.pricedate).getTime();
          bValue = new Date(b.pricedate).getTime();
          break;
        default:
          aValue = a.pricedate;
          bValue = b.pricedate;
      }

      if (this.sortDirection === 'asc') {
        return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
      } else {
        return aValue < bValue ? 1 : aValue > bValue ? -1 : 0;
      }
    });
  }

  sort(column: string): void {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'asc';
    }
    this.applyFilters();
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
      this.applyFilters();
    }
  }

  getPageNumbers(): number[] {
    const pages: number[] = [];
    const VISIBLE_PAGES = 5;

    if (this.totalPages <= VISIBLE_PAGES) {
      for (let i = 1; i <= this.totalPages; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);
      const start = Math.max(2, this.currentPage - 1);
      const end = Math.min(this.totalPages - 1, this.currentPage + 1);

      if (start > 2) {
        pages.push(-1);
      }
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      if (end < this.totalPages - 1) {
        pages.push(-1);
      }
      pages.push(this.totalPages);
    }
    return pages;
  }

  onAddNew(): void {
    this.router.navigate(['/material-price/new']);
  }

  onEdit(price: MaterialPrice): void {
    this.router.navigate(['/material-price/edit', price.id]);
  }

  onDelete(price: MaterialPrice): void {
    this.selectedPrice = price;
    this.showDeleteConfirmation = true;
  }

  cancelDelete(): void {
    this.selectedPrice = null;
    this.showDeleteConfirmation = false;
  }

  confirmDelete(): void {
    if (this.selectedPrice) {
      this.http.delete(`${API_URLS.DELETELOCATIONMATERIALPRICE}/${this.selectedPrice.id}`).subscribe({
        next: () => {
          this.materialPrices = this.materialPrices.filter(p => p.id !== this.selectedPrice!.id);
          this.applyFilters();
          this.showDeleteConfirmation = false;
          this.selectedPrice = null;
        },
        error: (err) => {
          console.error('Failed to delete material price', err);
          alert('Failed to delete the material price. Please try again.');
          this.showDeleteConfirmation = false;
        }
      });
    }
  }
}