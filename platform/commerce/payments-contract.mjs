// platform/commerce/payments-contract.mjs - reusable commerce and payments contract.
//
// Commerce turns opportunity into accountable exchange. The contract supports
// tickets, packages, sponsorships, services, products, refunds, credits,
// provider records, fees, taxes, and reporting without storing raw payment
// credentials or binding the platform to one payment provider.

export const COMMERCE_RECORD_TYPES = [
  {
    key: 'order',
    label: 'Order',
    purpose: 'Records a purchase, reservation, sponsorship, ticket, package, service, product, or marketplace transaction.',
  },
  {
    key: 'payment',
    label: 'Payment',
    purpose: 'Tracks payment state and provider references without storing raw card or bank credentials.',
  },
  {
    key: 'refund',
    label: 'Refund',
    purpose: 'Records full or partial returns, reversals, credits, and dispute outcomes.',
  },
  {
    key: 'invoice',
    label: 'Invoice',
    purpose: 'Represents payable obligations for sponsors, vendors, organizations, or enterprise customers.',
  },
  {
    key: 'ledger-entry',
    label: 'Ledger Entry',
    purpose: 'Creates auditable financial movement records for gross, fees, net, tax, credit, and adjustment amounts.',
  },
]

export const COMMERCE_REQUIRED_FIELDS = [
  'id',
  'recordType',
  'ecosystemId',
  'buyerPersonId',
  'buyerOrganizationId',
  'sellerOrganizationId',
  'sourceEntityType',
  'sourceEntityId',
  'provider',
  'providerReference',
  'status',
  'currency',
  'grossCents',
  'feeCents',
  'taxCents',
  'netCents',
  'auditTrail',
  'createdAt',
  'updatedAt',
]

export const COMMERCE_STATUS_STATES = [
  'draft',
  'pending',
  'authorized',
  'paid',
  'partially-refunded',
  'refunded',
  'failed',
  'disputed',
  'cancelled',
]

export const COMMERCE_PROVIDER_TYPES = [
  'eventbrite',
  'stripe',
  'square',
  'paypal',
  'manual-invoice',
  'offline-payment',
  'credit',
]

export const COMMERCE_OPERATOR_CONTROLS = [
  'sync provider order',
  'record offline payment',
  'issue refund',
  'issue credit',
  'export ledger',
  'reconcile provider totals',
  'mark dispute outcome',
]

export const COMMERCE_TRUST_CONTROLS = [
  'raw payment credentials are never stored',
  'provider references are auditable',
  'refund reasons are recorded',
  'fees and taxes are explicit',
  'manual adjustments require notes',
  'financial exports exclude unnecessary personal data',
  'provider errors do not expose secrets',
]

export function commercePaymentsContractSummary() {
  return {
    recordTypes: COMMERCE_RECORD_TYPES.map((type) => ({
      key: type.key,
      label: type.label,
      purpose: type.purpose,
    })),
    requiredFields: [...COMMERCE_REQUIRED_FIELDS],
    statusStates: [...COMMERCE_STATUS_STATES],
    providerTypes: [...COMMERCE_PROVIDER_TYPES],
    operatorControls: [...COMMERCE_OPERATOR_CONTROLS],
    trustControls: [...COMMERCE_TRUST_CONTROLS],
  }
}
