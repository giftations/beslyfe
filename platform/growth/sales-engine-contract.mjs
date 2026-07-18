// Beslyfe growth and sales launch contract.
// The first release deliberately uses provider-hosted checkout links so an
// owner can start selling without Beslyfe storing card data or payment secrets.

export const SALES_MODES = [
  { key: 'product', label: 'Sell a product', actionLabel: 'Buy now' },
  { key: 'service', label: 'Sell a service', actionLabel: 'Get started' },
  { key: 'booking', label: 'Book an appointment', actionLabel: 'Book now' },
  { key: 'lead', label: 'Collect a lead', actionLabel: 'Request details' },
  { key: 'donation', label: 'Accept a donation', actionLabel: 'Support this work' },
  { key: 'ticket', label: 'Sell a ticket', actionLabel: 'Get tickets' },
]

export const SALES_PROVIDERS = [
  { key: 'stripe-payment-link', label: 'Stripe Payment Link', effort: 'paste-link', supports: ['product', 'service', 'booking', 'donation', 'ticket'] },
  { key: 'shopify-buy-button', label: 'Shopify Buy Button', effort: 'paste-link-or-embed', supports: ['product'] },
  { key: 'square-checkout', label: 'Square Online Checkout', effort: 'paste-link', supports: ['product', 'service', 'booking', 'donation', 'ticket'] },
  { key: 'paypal', label: 'PayPal', effort: 'paste-link', supports: ['product', 'service', 'donation'] },
  { key: 'booking-link', label: 'Booking provider', effort: 'paste-link', supports: ['booking', 'service'] },
  { key: 'contact-form', label: 'Beslyfe lead form', effort: 'built-in', supports: ['lead'] },
  { key: 'external', label: 'Another secure checkout', effort: 'paste-link', supports: ['product', 'service', 'booking', 'donation', 'ticket'] },
]

export const SALES_REQUIRED_FIELDS = [
  'ecosystemId',
  'ownerProfileId',
  'mode',
  'provider',
  'offerName',
  'actionLabel',
  'destinationUrl',
  'status',
  'attribution',
  'createdAt',
  'updatedAt',
]

export const SALES_LAUNCH_STEPS = [
  'choose the result the customer should get',
  'name the offer in plain language',
  'connect a secure checkout, booking, donation, or lead destination',
  'publish the primary call to action',
  'share the offer with attributable campaign links',
  'measure visits, clicks, leads, and completed provider outcomes',
]

export const SALES_TRUST_CONTROLS = [
  'payment credentials stay with the payment provider',
  'price and seller are clear before checkout',
  'sponsored distribution is labeled',
  'every campaign link carries attribution',
  'owners can pause a sales action instantly',
  'ticketing is enabled only when explicitly selected',
]

export function salesEngineContractSummary() {
  return {
    modes: SALES_MODES.map((item) => ({ ...item })),
    providers: SALES_PROVIDERS.map((item) => ({ ...item, supports: [...item.supports] })),
    requiredFields: [...SALES_REQUIRED_FIELDS],
    launchSteps: [...SALES_LAUNCH_STEPS],
    trustControls: [...SALES_TRUST_CONTROLS],
  }
}
