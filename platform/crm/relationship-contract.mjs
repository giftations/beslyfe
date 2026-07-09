// platform/crm/relationship-contract.mjs - reusable CRM relationship contract.
//
// CRM is not a separate sales silo in Beslyfe. It is the operator-facing view of
// durable relationships between people, organizations, ecosystems, experiences,
// and opportunities. This contract keeps product labels configurable while the
// underlying relationship model stays reusable across future ecosystems.

export const CRM_RECORD_TYPES = [
  {
    key: 'person',
    label: 'Person',
    table: 'crm_people',
    purpose: 'A canonical human relationship record, deduplicated from profiles, applications, ticketing, conversations, and admin-created contacts.',
  },
  {
    key: 'company',
    label: 'Company',
    table: 'crm_companies',
    purpose: 'A canonical organization relationship record for sponsors, vendors, advertisers, partners, employers, operators, and future ecosystem businesses.',
  },
  {
    key: 'person-role',
    label: 'Person Role',
    table: 'crm_person_roles',
    purpose: 'Links one person to many roles across many ecosystems without duplicating the person.',
  },
  {
    key: 'company-event',
    label: 'Company Event',
    table: 'crm_company_events',
    purpose: 'Links one organization to many event or ecosystem editions without copying company data.',
  },
  {
    key: 'activity',
    label: 'Activity',
    table: 'crm_activities',
    purpose: 'A unified timeline entry for relationship context, follow-ups, tasks, applications, payments, sponsorships, advertising, and operator notes.',
  },
]

export const CRM_PIPELINE_STAGES = [
  'new',
  'contacted',
  'interested',
  'application_started',
  'application_submitted',
  'approved',
  'payment_pending',
  'paid',
  'onboarded',
  'active',
  'follow_up_needed',
  'closed_won',
  'closed_lost',
]

export const CRM_LEAD_SOURCES = [
  'website',
  'vendor_application',
  'sponsor_application',
  'speaker_application',
  'attendee_signup',
  'directory_profile',
  'admin_created',
  'import',
  'social',
  'referral',
  'advertising',
  'other',
]

export const CRM_ACTIVITY_KINDS = [
  'note',
  'call',
  'email',
  'meeting',
  'task',
  'status_change',
  'payment',
  'application',
  'sponsorship',
  'advertising',
  'other',
]

export const CRM_REQUIRED_FIELDS = [
  'id',
  'ecosystemId',
  'recordType',
  'status',
  'tags',
  'leadSource',
  'pipelineStage',
  'ownerAccountId',
  'followUpAt',
  'lastContactedAt',
  'lifetimeValueCents',
  'priority',
  'details',
  'createdAt',
  'updatedAt',
]

export const CRM_AUTOMATION_EVENTS = [
  'application.submitted',
  'application.status_changed',
  'profile.status_changed',
  'profile.featured_changed',
  'company.linked_to_event',
  'ad.campaign_created',
  'ticket.order_imported',
  'crm.followup_completed',
]

export const CRM_TRUST_CONTROLS = [
  'admin mutations require same-origin checks',
  'admin identity is derived from session only',
  'activity creation is best-effort from external workflows',
  'secrets and provider tokens are never written to CRM activity details',
  'pipeline labels are configurable per ecosystem',
  'AI follow-up suggestions require consent-compatible relationship data',
  'relationship outcomes are measured without engagement-only optimization',
]

export function crmRecordTypeKeys() {
  return CRM_RECORD_TYPES.map((type) => type.key)
}

export function crmRelationshipContractSummary() {
  return {
    recordTypes: CRM_RECORD_TYPES.map((type) => ({
      key: type.key,
      label: type.label,
      table: type.table,
      purpose: type.purpose,
    })),
    pipelineStages: [...CRM_PIPELINE_STAGES],
    leadSources: [...CRM_LEAD_SOURCES],
    activityKinds: [...CRM_ACTIVITY_KINDS],
    requiredFields: [...CRM_REQUIRED_FIELDS],
    automationEvents: [...CRM_AUTOMATION_EVENTS],
    trustControls: [...CRM_TRUST_CONTROLS],
  }
}
