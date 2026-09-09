import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';

/**
 * Inline template and styles on purpose — see price-badge.component.ts for why.
 * Small presentational components like this one are where inline templates
 * realistically survive in a large Angular codebase.
 */
@Component({
  selector: 'shop-empty-state',
  template: `
    <div class="empty-state" role="status">
      <h2 class="empty-heading">{{ heading() }}</h2>
      <p class="empty-message">{{ message() }}</p>
      @if (actionLabel(); as label) {
        <button type="button" class="empty-action" (click)="action.emit()">
          {{ label }}
        </button>
      }
    </div>
  `,
  styles: [
    `
      .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        padding: 48px 24px;
        text-align: center;
        color: #2c3e50;
      }

      .empty-heading {
        margin: 0;
        font-size: 1.1rem;
        font-weight: 600;
      }

      .empty-message {
        margin: 0;
        font-size: 0.9rem;
        color: #666;
      }

      .empty-action {
        margin-top: 8px;
        padding: 10px 18px;
        border: 0;
        border-radius: 4px;
        background: #2c3e50;
        color: #ffffff;
        font-size: 0.9rem;
        cursor: pointer;
      }

      .empty-action:hover {
        background: #1a252f;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmptyStateComponent {
  readonly heading = input('Nothing here yet');
  readonly message = input('Try adjusting your filters.');
  readonly actionLabel = input<string | null>(null);
  readonly action = output<void>();
}
