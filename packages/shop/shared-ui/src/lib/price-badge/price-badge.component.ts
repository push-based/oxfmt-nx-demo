import { CurrencyPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';

/**
 * Inline template and styles on purpose.
 *
 * Angular's `template:` is an *untagged* template literal, so neither oxfmt nor
 * Prettier reformats the HTML inside it — they both treat it as opaque string
 * content in a TS file. That makes this file the third routing case:
 *
 *   *.component.html  → oxfmt
 *   plain *.html       → Prettier
 *   inline template    → neither
 *
 * See tools/scripts/format/format.mjs.
 */
@Component({
  selector: 'shop-price-badge',
  imports: [CurrencyPipe],
  template: `
    <span class="price-badge">
      <span class="current">{{ price() | currency }}</span>
      @if (discount(); as d) {
        <span class="was">{{ d.was | currency }}</span>
        <span class="discount">-{{ d.percent }}%</span>
      }
    </span>
  `,
  styles: [
    `
      .price-badge {
        display: inline-flex;
        align-items: baseline;
        gap: 8px;
      }

      .current {
        font-size: 1.25rem;
        font-weight: bold;
        color: #2c3e50;
      }

      .was {
        font-size: 0.9rem;
        color: #999;
        text-decoration: line-through;
      }

      .discount {
        font-size: 0.8rem;
        font-weight: 600;
        color: #ffffff;
        background: #c0392b;
        border-radius: 3px;
        padding: 2px 6px;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PriceBadgeComponent {
  readonly price = input.required<number>();
  readonly compareAtPrice = input<number | null>(null);

  readonly discount = computed(() => {
    const was = this.compareAtPrice();
    const now = this.price();
    if (was === null || was <= now) return null;
    return { was, percent: Math.round(((was - now) / was) * 100) };
  });
}
