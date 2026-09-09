import { CommonModule, CurrencyPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { Product } from '@org/models';
import { ProductsService } from '@org/shop/data';
import {
  ErrorMessageComponent,
  LoadingSpinnerComponent,
} from '@org/shop/shared-ui';

@Component({
  selector: 'shop-product-detail',
  imports: [
    CommonModule,
    CurrencyPipe,
    RouterLink,
    LoadingSpinnerComponent,
    ErrorMessageComponent,
  ],
  templateUrl: './product-detail.component.html',
  styleUrls: ['./product-detail.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly productsService = inject(ProductsService);

  // State signals
  readonly product = signal<Product | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  ngOnInit() {
    this.loadProduct();
  }

  loadProduct() {
    const productId = this.route.snapshot.paramMap.get('id');

    if (!productId) {
      this.error.set('Product ID not provided');
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    this.productsService.getProductById(productId).subscribe({
      next: (product) => {
        if (product) {
          this.product.set(product);
        } else {
          this.error.set('Product not found');
        }
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set('Failed to load product details');
        this.loading.set(false);
        console.error('Error loading product:', err);
      },
    });
  }

  getStars(): boolean[] {
    const product = this.product();
    if (!product) return [];

    const rating = product.rating;
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;

    return Array(5)
      .fill(false)
      .map((_, index) => {
        if (index < fullStars) return true;
        if (index === fullStars && hasHalfStar) return true;
        return false;
      });
  }

  addToCart() {
    // This would typically call a cart service
    console.log('Adding to cart:', this.product()?.id);
    alert('Product added to cart!');
  }

  addToWishlist() {
    // This would typically call a wishlist service
    console.log('Adding to wishlist:', this.product()?.id);
    alert('Product added to wishlist!');
  }
}
