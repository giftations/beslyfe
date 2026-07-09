// platform/integrations/webhooks-contract.mjs - reusable integrations and webhooks contract.
//
// Integrations let ecosystems connect to outside providers without making any
// provider the platform. The contract supports inbound webhooks, outbound sync,
// provider credentials, retries, idempotency, audit logs, and secret-safe errors.

export const INTEGRATION_TYPES = [
  {
    key: 'email-provider',
    label: 'Email Provider',
    purpose: 'Connects transactional email services for verification, reset, approval, and operational notices.',
  },
  {
    key: 'ticketing-provider',
    label: 'Ticketing Provider',
    purpose: 'Syncs tickets, packages, access links, orders, attendees, and event-provider references.',
  },
  {
    key: 'payment-provider',
    label: 'Payment Provider',
    purpose: 'Connects payment processors while keeping raw payment credentials outside the platform.',
  },
  {
    key: 'calendar-provider',
    label: 'Calendar Provider',
    purpose: 'Syncs appointments, sessions, reminders, availability, and attendee calendar subscriptions.',
  },
  {
    key: 'analytics-provider',
    label: 'Analytics Provider',
    purpose: 'Exports or imports outcome metrics, delivery events, campaign reporting, and operational telemetry.',
  },
]

export const INTEGRATION_REQUIRED_FIELDS = [
  'id',
  'integrationType',
  'ecosystemId',
  'provider',
  'direction',
  'status',
  'credentialReference',
  'webhookSecretReference',
  'endpointUrl',
  'eventTypes',
  'idempotencyKey',
  'retryPolicy',
  'lastSyncedAt',
  'auditTrail',
  'createdAt',
  'updatedAt',
]

export const INTEGRATION_DIRECTIONS = [
  'inbound',
  'outbound',
  'bidirectional',
  'manual-import',
  'manual-export',
]

export const INTEGRATION_STATUS_STATES = [
  'draft',
  'configured',
  'active',
  'paused',
  'degraded',
  'failed',
  'revoked',
  'archived',
]

export const WEBHOOK_DELIVERY_STATES = [
  'received',
  'verified',
  'ignored-duplicate',
  'processed',
  'retrying',
  'failed',
  'dead-lettered',
]

export const INTEGRATION_OPERATOR_CONTROLS = [
  'rotate credential',
  'pause integration',
  'replay webhook',
  'retry failed sync',
  'export audit log',
  'disable provider',
  'map provider fields',
]

export const INTEGRATION_TRUST_CONTROLS = [
  'secrets are stored by reference only',
  'webhook signatures are verified',
  'idempotency prevents duplicate writes',
  'provider errors do not expose secrets',
  'field mappings are auditable',
  'manual imports require source notes',
  'sync failures are visible to operators',
]

export function integrationsWebhooksContractSummary() {
  return {
    integrationTypes: INTEGRATION_TYPES.map((type) => ({
      key: type.key,
      label: type.label,
      purpose: type.purpose,
    })),
    requiredFields: [...INTEGRATION_REQUIRED_FIELDS],
    directions: [...INTEGRATION_DIRECTIONS],
    statusStates: [...INTEGRATION_STATUS_STATES],
    webhookDeliveryStates: [...WEBHOOK_DELIVERY_STATES],
    operatorControls: [...INTEGRATION_OPERATOR_CONTROLS],
    trustControls: [...INTEGRATION_TRUST_CONTROLS],
  }
}
