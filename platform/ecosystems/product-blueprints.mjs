// Product blueprints describe starting points, not hard-coded products.
// Every capability remains optional unless it is part of the small shared core.
// In particular, ticketing is never implied by creating a website or business.

export const SHARED_PRODUCT_CORE = ['identity', 'cms', 'analytics', 'community-bridge']

export const PRODUCT_BLUEPRINTS = [
  {
    key: 'business',
    label: 'Business',
    promise: 'Launch a credible business presence, turn visitors into leads, and start selling online.',
    defaultCapabilities: ['cms', 'commerce', 'crm', 'directory', 'community'],
    optionalCapabilities: ['messaging', 'advertising', 'scheduling', 'applications', 'ai'],
    exampleAnswers: ['Sell products online', 'Book more clients', 'Collect qualified leads'],
  },
  {
    key: 'website',
    label: 'Website',
    promise: 'Publish a focused website and add only the growth tools the owner needs.',
    defaultCapabilities: ['cms', 'analytics'],
    optionalCapabilities: ['commerce', 'crm', 'directory', 'community', 'messaging', 'scheduling', 'ai'],
    exampleAnswers: ['Show my work', 'Explain my services', 'Turn traffic into sales'],
  },
  {
    key: 'publisher',
    label: 'Blog, publication, or newsletter',
    promise: 'Publish consistently, grow an audience, and turn useful content into opportunity.',
    defaultCapabilities: ['cms', 'community', 'directory'],
    optionalCapabilities: ['commerce', 'messaging', 'crm', 'advertising', 'ai', 'automation'],
    exampleAnswers: ['Launch a blog', 'Grow a newsletter', 'Automate my publishing rhythm'],
  },
  {
    key: 'creator',
    label: 'Model, creator, or portfolio',
    promise: 'Show your work, book opportunities, grow a following, and sell directly.',
    defaultCapabilities: ['cms', 'community', 'directory', 'crm'],
    optionalCapabilities: ['commerce', 'messaging', 'scheduling', 'advertising', 'ai', 'automation'],
    exampleAnswers: ['Book modeling work', 'Build a media kit', 'Grow my audience'],
  },
  {
    key: 'retail',
    label: 'Retail store',
    promise: 'Connect the storefront, products, people, promotions, customer growth, and daily operation.',
    defaultCapabilities: ['cms', 'commerce', 'crm', 'directory', 'operations', 'inventory', 'automation'],
    optionalCapabilities: ['community', 'messaging', 'advertising', 'scheduling', 'applications', 'ai', 'floorplan'],
    exampleAnswers: ['Organize store operations', 'Sell in person and online', 'Automate daily follow-up'],
  },
  {
    key: 'property',
    label: 'Property management',
    promise: 'Coordinate properties, owners, tenants, applications, maintenance, payments, and reporting.',
    defaultCapabilities: ['cms', 'crm', 'directory', 'scheduling', 'applications', 'operations', 'property', 'automation'],
    optionalCapabilities: ['commerce', 'community', 'messaging', 'ai'],
    exampleAnswers: ['Track maintenance requests', 'Organize tenants and owners', 'Automate reminders'],
  },
  {
    key: 'community',
    label: 'Community',
    promise: 'Create a member network with a feed, reels, groups, messaging, profiles, and shared wins.',
    defaultCapabilities: ['community', 'messaging', 'directory', 'cms'],
    optionalCapabilities: ['commerce', 'crm', 'scheduling', 'applications', 'advertising', 'ai'],
    exampleAnswers: ['Help members collaborate', 'Share success stories', 'Create opportunities'],
  },
  {
    key: 'event',
    label: 'Event',
    promise: 'Build an event experience with community before, during, and after the event.',
    defaultCapabilities: ['cms', 'community', 'directory', 'scheduling'],
    optionalCapabilities: ['ticketing', 'commerce', 'applications', 'messaging', 'floorplan', 'advertising', 'crm', 'ai'],
    exampleAnswers: ['Grow an event community', 'Manage speakers and schedules', 'Sell tickets if I choose'],
  },
  {
    key: 'nonprofit',
    label: 'Nonprofit or cause',
    promise: 'Organize supporters, share progress, accept donations, and turn attention into action.',
    defaultCapabilities: ['cms', 'community', 'directory', 'crm'],
    optionalCapabilities: ['commerce', 'messaging', 'scheduling', 'applications', 'ai'],
    exampleAnswers: ['Accept donations', 'Recruit volunteers', 'Show measurable impact'],
  },
  {
    key: 'custom',
    label: 'Something else',
    promise: 'Start with the dream, the people, and the repetitive work. Beslyfe will shape a custom system.',
    defaultCapabilities: ['cms', 'operations', 'automation'],
    optionalCapabilities: ['commerce', 'crm', 'directory', 'community', 'messaging', 'scheduling', 'applications', 'advertising', 'ai', 'floorplan'],
    exampleAnswers: ['Invent a new service', 'Organize a complicated workflow', 'Automate the repetitive parts'],
  },
]

export const PRODUCT_OUTCOMES = [
  { key: 'online-sales', label: 'Generate online sales', capabilities: ['commerce', 'analytics', 'crm'] },
  { key: 'qualified-leads', label: 'Collect qualified leads', capabilities: ['crm', 'cms', 'analytics'] },
  { key: 'bookings', label: 'Book appointments or services', capabilities: ['scheduling', 'commerce', 'crm'] },
  { key: 'community-growth', label: 'Grow a community', capabilities: ['community', 'messaging', 'directory'] },
  { key: 'publish-content', label: 'Publish useful content', capabilities: ['cms', 'community'] },
  { key: 'grow-audience', label: 'Grow an audience', capabilities: ['cms', 'community', 'analytics', 'advertising'] },
  { key: 'book-opportunities', label: 'Book paid opportunities', capabilities: ['scheduling', 'crm', 'commerce', 'directory'] },
  { key: 'run-operations', label: 'Organize daily operations', capabilities: ['operations', 'automation', 'crm', 'analytics'] },
  { key: 'manage-inventory', label: 'Manage products and inventory', capabilities: ['inventory', 'operations', 'commerce', 'analytics'] },
  { key: 'manage-properties', label: 'Manage properties and tenants', capabilities: ['property', 'operations', 'crm', 'scheduling', 'applications'] },
  { key: 'automate-workflows', label: 'Automate repetitive work', capabilities: ['automation', 'ai', 'analytics'] },
  { key: 'ticket-sales', label: 'Sell event tickets', capabilities: ['ticketing', 'commerce'] },
  { key: 'donations', label: 'Accept donations', capabilities: ['commerce', 'crm'] },
]

export function productBlueprint(key) {
  return PRODUCT_BLUEPRINTS.find((item) => item.key === key) || PRODUCT_BLUEPRINTS[1]
}

export function recommendCapabilities({ productType = 'website', outcomes = [], selected = [] } = {}) {
  const blueprint = productBlueprint(productType)
  const allowedOutcomes = new Set(PRODUCT_OUTCOMES.map((item) => item.key))
  const requestedOutcomes = Array.isArray(outcomes) ? outcomes.filter((key) => allowedOutcomes.has(key)) : []
  const capabilities = new Set([...SHARED_PRODUCT_CORE, ...blueprint.defaultCapabilities])
  for (const outcomeKey of requestedOutcomes) {
    const outcome = PRODUCT_OUTCOMES.find((item) => item.key === outcomeKey)
    for (const capability of outcome.capabilities) capabilities.add(capability)
  }
  for (const capability of Array.isArray(selected) ? selected : []) {
    if (typeof capability === 'string' && capability) capabilities.add(capability)
  }
  // Ticketing is explicit. It is never inherited from an event blueprint and
  // never added to websites or businesses unless the owner selected ticket sales.
  if (!requestedOutcomes.includes('ticket-sales') && !selected.includes('ticketing')) {
    capabilities.delete('ticketing')
  }
  return [...capabilities]
}

export function productBlueprintSummary() {
  return {
    sharedCore: [...SHARED_PRODUCT_CORE],
    blueprints: PRODUCT_BLUEPRINTS.map((item) => ({ ...item })),
    outcomes: PRODUCT_OUTCOMES.map((item) => ({ ...item })),
  }
}
