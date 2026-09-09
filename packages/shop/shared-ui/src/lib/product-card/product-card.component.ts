import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';

import { Product } from '@org/models';

import { PriceBadgeComponent } from '../price-badge/price-badge.component';

@Component({
  selector: 'shop-product-card',
  imports: [CommonModule, PriceBadgeComponent],
  templateUrl: './product-card.component.html',
  styleUrls: ['./product-card.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductCardComponent {
  readonly product = input.required<Product>();
  readonly productClick = output<Product>();

  getStars(): boolean[] {
    const rating = this.product().rating;
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
}
