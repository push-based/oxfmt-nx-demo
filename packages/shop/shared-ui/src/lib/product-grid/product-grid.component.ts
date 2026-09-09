import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';

import { Product } from '@org/models';

import { ProductCardComponent } from '../product-card/product-card.component';

@Component({
  selector: 'shop-product-grid',
  imports: [CommonModule, ProductCardComponent],
  templateUrl: './product-grid.component.html',
  styleUrls: ['./product-grid.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductGridComponent {
  readonly products = input.required<Product[]>();
  readonly productSelect = output<Product>();
}
