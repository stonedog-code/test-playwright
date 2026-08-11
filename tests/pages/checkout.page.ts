import type { Locator } from '@playwright/test';

import { BasePage } from './base.page';

export type ShippingSpeed = 'Standard (5–7 days)' | 'Express (2 days)' | 'Orbital drop (next launch window)';

export interface OrderDetails {
  fullName?: string;
  email?: string;
  country?: string;
  deliverBy?: string;
  shipping?: ShippingSpeed;
  acceptTerms?: boolean;
}

export class CheckoutPage extends BasePage {
  readonly path = '/checkout.html';

  get fullName(): Locator {
    return this.page.getByLabel('Full name');
  }

  get email(): Locator {
    return this.page.getByLabel('Email address');
  }

  get country(): Locator {
    return this.page.getByLabel('Country');
  }

  get deliverBy(): Locator {
    return this.page.getByLabel('Deliver by');
  }

  shipping(speed: ShippingSpeed): Locator {
    return this.page.getByRole('radio', { name: speed });
  }

  get terms(): Locator {
    return this.page.getByRole('checkbox', { name: 'I accept the terms of sale' });
  }

  get newsletter(): Locator {
    return this.page.getByRole('checkbox', { name: 'Email me about new parts' });
  }

  get exportLicence(): Locator {
    return this.page.getByLabel('Export licence (PDF or text)');
  }

  get placeOrder(): Locator {
    return this.page.getByRole('button', { name: 'Place order' });
  }

  get cancelOrder(): Locator {
    return this.page.getByRole('button', { name: 'Cancel order' });
  }

  get confirmation(): Locator {
    return this.page.getByRole('heading', { name: 'Order confirmed' });
  }

  get orderId(): Locator {
    return this.page.locator('#order-id');
  }

  /** The inline error under a specific field. */
  errorFor(field: 'fullName' | 'email' | 'country' | 'shipping' | 'terms'): Locator {
    return this.page.locator(`[data-error-for="${field}"]`);
  }

  get basket(): Locator {
    return this.page.getByRole('table', { name: 'Items in this order' });
  }

  /** A table row identified by the part it contains, not by its index. */
  basketRow(partName: string): Locator {
    return this.basket.getByRole('row').filter({ hasText: partName });
  }

  async fillOrder(details: OrderDetails): Promise<void> {
    if (details.fullName !== undefined) await this.fullName.fill(details.fullName);
    if (details.email !== undefined) await this.email.fill(details.email);

    // selectOption takes the VALUE by default. Pass { label: '...' } to select
    // by visible text — which is what a person actually sees, and what survives
    // a change to the underlying value.
    if (details.country !== undefined) await this.country.selectOption({ label: details.country });

    if (details.deliverBy !== undefined) await this.deliverBy.fill(details.deliverBy);
    if (details.shipping !== undefined) await this.shipping(details.shipping).check();
    if (details.acceptTerms) await this.terms.check();
  }
}
