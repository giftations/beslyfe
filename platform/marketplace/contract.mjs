// platform/marketplace/contract.mjs - reusable marketplace contract.
//
// Marketplace is the exchange layer for tickets, packages, ads, services,
// products, jobs, sponsorships, and offers. It must connect supply and demand
// without hiding incentives, ownership, payment boundaries, or trust risks.

export const MARKETPLACE_OFFER_TYPES = [
  {
    key: 'ticket',
    label: 'Ticket',
    purpose: 'Grants access to an event, session, appointment, or experience.',
  },
  {
    key: 'package',
    label: 'Package',
    purpose: 'Bundles access, placement, services, or benefits behind clear terms.',
  },
  {
    key: 'sponsorship',
    label: 'Sponsorship',
    purpose: 'Creates paid visibility or partnership with explicit disclosure.',
  },
  {
    key: 'service',
    label: 'Service',
    purpose: 'Connects an organization or person to work someone can provide.',
  },
  {
    key: 'product',
    label: 'Product',
    purpose: 'Connects buyers with goods or merchandise in an ecosystem context.',
  },
  {
    key: 'job',
    label: 'Job',
    purpose: 'Connects employers, gigs, contracts, or roles with qualified people.',
  },
  {
    key: 'advertising',
    label: 'Advertising',
    purpose: 'Creates paid placement with measurable outcomes and guardrails.',
  },
]

export const MARKETPLACE_REQUIRED_FIELDS = [
  'id',
  'type',
  'title',
  'summary',
  'ecosystemId',
  'sellerType',
  'sellerId',
  'audience',
  'priceModel',
  'provider',
  'availability',
  'terms',
  'disclosure',
  'approvalRequirements',
  'fulfillment',
  'outcomeMetric',
  'createdAt',
  'updatedAt',
]

export const MARKETPLACE_PRICE_MODELS = [
  'free',
  'fixed-price',
  'tiered',
  'quote-required',
  'application-gated',
  'external-provider',
]

export const MARKETPLACE_TRUST_CONTROLS = [
  'clear seller',
  'clear price or application gate',
  'sponsored disclosure',
  'payment provider disclosure',
  'refund or cancellation terms',
  'approval audit trail',
  'outcome and guardrail reporting',
]

export function marketplaceContractSummary() {
  return {
    offerTypes: MARKETPLACE_OFFER_TYPES.map((type) => ({
      key: type.key,
      label: type.label,
      purpose: type.purpose,
    })),
    requiredFields: [...MARKETPLACE_REQUIRED_FIELDS],
    priceModels: [...MARKETPLACE_PRICE_MODELS],
    trustControls: [...MARKETPLACE_TRUST_CONTROLS],
  }
}
