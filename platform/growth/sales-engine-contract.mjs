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
  { key: 'paypal', label: 'PayPal.Me', effort: 'username', entry: 'handle', handlePrefix: '@', handleExample: '@YourPayPalName', handlePattern: '^[A-Za-z0-9]{1,20}$', destinationTemplate: 'https://paypal.me/{handle}', supports: ['product', 'service', 'booking', 'donation', 'ticket'] },
  { key: 'cash-app', label: 'Cash App', effort: 'username', entry: 'handle', handlePrefix: '@', handleExample: '@YourCashtag', handlePattern: '^[A-Za-z][A-Za-z0-9]{0,19}$', destinationTemplate: 'https://cash.app/${handle}', supports: ['product', 'service', 'booking', 'donation', 'ticket'] },
  { key: 'venmo', label: 'Venmo', effort: 'username', entry: 'handle', handlePrefix: '@', handleExample: '@YourVenmoName', handlePattern: '^[A-Za-z0-9_-]{5,30}$', destinationTemplate: 'https://venmo.com/u/{handle}', supports: ['product', 'service', 'booking', 'donation', 'ticket'] },
  { key: 'stripe-payment-link', label: 'Stripe Payment Link', effort: 'paste-link', supports: ['product', 'service', 'booking', 'donation', 'ticket'] },
  { key: 'shopify-buy-button', label: 'Shopify Buy Button', effort: 'paste-link-or-embed', supports: ['product'] },
  { key: 'square-checkout', label: 'Square Online Checkout', effort: 'paste-link', supports: ['product', 'service', 'booking', 'donation', 'ticket'] },
  { key: 'booking-link', label: 'Booking provider', effort: 'paste-link', supports: ['booking', 'service'] },
  { key: 'contact-form', label: 'Beslyfe lead form', effort: 'built-in', entry: 'built-in', supports: ['lead'] },
  { key: 'external', label: 'Another secure checkout', effort: 'paste-link', supports: ['product', 'service', 'booking', 'donation', 'ticket'] },
]

export function normalizePaymentHandle(providerKey, value) {
  const provider = SALES_PROVIDERS.find((item) => item.key === providerKey)
  if (!provider || provider.entry !== 'handle') return ''
  const handle = String(value || '').trim().replace(/^[@$]+/, '')
  if (!handle || !(new RegExp(provider.handlePattern).test(handle))) return ''
  return handle
}

export function paymentDestinationFromHandle(providerKey, value) {
  const provider = SALES_PROVIDERS.find((item) => item.key === providerKey)
  const handle = normalizePaymentHandle(providerKey, value)
  if (!provider || !handle) return ''
  return provider.destinationTemplate.replace('{handle}', encodeURIComponent(handle))
}

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
  'handle-built payment links are previewed before publishing',
  'commercial sellers use the account type and protections required by their payment provider',
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
