import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { Product, ProductFilter } from '@org/models';
import { ProductsService } from '@org/shop/data';
import {
  EmptyStateComponent,
  ErrorMessageComponent,
  LoadingSpinnerComponent,
  ProductGridComponent,
} from '@org/shop/shared-ui';

@Component({
  selector: 'shop-product-list',
  imports: [
    CommonModule,
    FormsModule,
    ProductGridComponent,
    LoadingSpinnerComponent,
    ErrorMessageComponent,
    EmptyStateComponent,
  ],
  templateUrl: './product-list.component.html',
  styleUrls: ['./product-list.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductListComponent implements OnInit {
  private readonly productsService = inject(ProductsService);
  private readonly router = inject(Router);

  // State signals
  readonly products = signal<Product[]>([]);
  readonly totalProducts = signal(0);
  readonly currentPage = signal(1);
  readonly totalPages = signal(0);
  readonly categories = signal<string[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  // Filter state
  searchTerm = '';
  selectedCategory = '';
  inStockOnly = false;

  // Computed values
  readonly hasMorePages = computed(() => this.totalPages() > 1);

  ngOnInit() {
    this.loadCategories();
    this.loadProducts();
  }

  loadCategories() {
    this.productsService.getCategories().subscribe({
      next: (categories) => this.categories.set(categories),
      error: (err) => console.error('Error loading categories:', err),
    });
  }

  loadProducts() {
    this.loading.set(true);
    this.error.set(null);

    const filter: ProductFilter = {};

    if (this.searchTerm) {
      filter.searchTerm = this.searchTerm;
    }
    if (this.selectedCategory) {
      filter.category = this.selectedCategory;
    }
    if (this.inStockOnly) {
      filter.inStock = true;
    }

    this.productsService.getProducts(filter, this.currentPage(), 12).subscribe({
      next: (response) => {
        this.products.set(response.items);
        this.totalProducts.set(response.total);
        this.totalPages.set(response.totalPages);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set('Failed to load products. Please try again.');
        this.loading.set(false);
        console.error('Error loading products:', err);
      },
    });
  }

  onSearchChange() {
    this.currentPage.set(1);
    this.loadProducts();
  }

  onFilterChange() {
    this.currentPage.set(1);
    this.loadProducts();
  }

  clearFilters() {
    this.searchTerm = '';
    this.selectedCategory = '';
    this.inStockOnly = false;
    this.currentPage.set(1);
    this.loadProducts();
  }

  onProductSelect(product: Product) {
    this.router.navigate(['/products', product.id]);
  }

  nextPage() {
    if (this.currentPage() < this.totalPages()) {
      this.currentPage.update((page) => page + 1);
      this.loadProducts();
    }
  }

  previousPage() {
    if (this.currentPage() > 1) {
      this.currentPage.update((page) => page - 1);
      this.loadProducts();
    }
  }
}
