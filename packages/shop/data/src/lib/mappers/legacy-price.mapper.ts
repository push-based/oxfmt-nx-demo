/* eslint-disable @typescript-eslint/no-explicit-any */

import { Product } from '@org/models';

/**
 * The upstream pricing service is untyped, so this mapper is the one place in the
 * workspace where `any` is allowed. The `eslint-disable` above has to stay on the
 * first line of the file — if an import sorter moves it down, every `any` below it
 * starts failing lint.
 */
export function mapLegacyPrice(raw: any): Pick<Product, 'price'> {
  return { price: Number(raw?.amount ?? raw?.value ?? 0) };
}
