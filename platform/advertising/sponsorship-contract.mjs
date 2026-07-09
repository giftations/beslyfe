// platform/advertising/sponsorship-contract.mjs - reusable advertising and sponsorship contract.
//
// Paid visibility can create opportunity when it is transparent, relevant, and
// measured against outcomes. The contract supports campaigns, sponsorships,
// placements, creatives, disclosures, budgets, delivery logs, and guardrails
// without letting paid attention override trust.

export const ADVERTISING_OFFER_TYPES = [
  {
    key: 'sponsorship-package',
    label: 'Sponsorship Package',
    purpose: 'Bundles paid visibility, marketplace presence, event benefits, and reporting for an organization.',
  },
  {
    key: 'campaign',
    label: 'Campaign',
    purpose: 'Runs paid visibility across one or more placements with budget, timing, creative, and outcome rules.',
  },
  {
    key: 'placement',
    label: 'Placement',
    purpose: 'Defines where sponsored visibility can appear, such as homepage, directory, map, email, feed, or sidebar.',
  },
  {
    key: 'creative',
    label: 'Creative',
    purpose: 'Stores the approved copy, media, links, disclosure label, and review state for paid visibility.',
  },
  {
    key: 'delivery-log',
    label: 'Delivery Log',
    purpose: 'Records impressions, clicks, conversions, spend, frequency, and reporting evidence.',
  },
]

export const ADVERTISING_REQUIRED_FIELDS = [
  'id',
  'offerType',
  'ecosystemId',
  'advertiserOrganizationId',
  'campaignId',
  'placementId',
  'creativeId',
  'status',
  'disclosureLabel',
  'budget',
  'startsAt',
  'endsAt',
  'targetingRules',
  'outcomeMetric',
  'guardrailMetrics',
  'auditTrail',
  'createdAt',
  'updatedAt',
]

export const ADVERTISING_STATUS_STATES = [
  'draft',
  'pending-review',
  'approved',
  'active',
  'paused',
  'completed',
  'rejected',
  'archived',
]

export const ADVERTISING_PLACEMENT_TYPES = [
  'homepage-banner',
  'directory-feature',
  'map-feature',
  'email-sponsor',
  'feed-sponsor',
  'sidebar',
  'event-stage',
]

export const ADVERTISING_OPERATOR_CONTROLS = [
  'approve creative',
  'pause campaign',
  'cap frequency',
  'label sponsored placement',
  'export delivery report',
  'refund or credit package',
  'block unsafe advertiser',
]

export const ADVERTISING_TRUST_CONTROLS = [
  'sponsored visibility is labeled',
  'targeting excludes private fields',
  'frequency limits are enforced',
  'creative review is auditable',
  'outcome reporting separates paid and organic results',
  'AI optimization cannot use engagement-only metrics',
  'advertiser influence is visible in recommendations',
]

export function advertisingSponsorshipContractSummary() {
  return {
    offerTypes: ADVERTISING_OFFER_TYPES.map((type) => ({
      key: type.key,
      label: type.label,
      purpose: type.purpose,
    })),
    requiredFields: [...ADVERTISING_REQUIRED_FIELDS],
    statusStates: [...ADVERTISING_STATUS_STATES],
    placementTypes: [...ADVERTISING_PLACEMENT_TYPES],
    operatorControls: [...ADVERTISING_OPERATOR_CONTROLS],
    trustControls: [...ADVERTISING_TRUST_CONTROLS],
  }
}
