// platform/core/manifest.mjs — the core domain map.
//
// "Core" is the set of cross-cutting entities every event on the platform
// shares. This file is documentation-as-data: each entry names a core domain
// and the concrete tables/functions that already implement it, so the platform
// layer describes the real system rather than an aspirational parallel one.
// It is served read-only via `GET events?platform` and consumed by the Admin OS
// System view. Nothing here gates behavior — it is a map, not a switch.

export const CORE = [
  {
    key: 'organizations',
    label: 'Organizations',
    summary: 'The operator/owner above events. Modeled today via CRM companies; a first-class parent of events on the roadmap.',
    tables: ['crm_companies'],
    functions: ['crm'],
    status: 'partial',
  },
  {
    key: 'events',
    label: 'Events',
    summary: 'The tenant root. Every record is scoped to an edition; exactly one is active.',
    tables: ['events'],
    functions: ['events'],
    status: 'live',
  },
  {
    key: 'people',
    label: 'People',
    summary: 'Individuals across editions — directory profiles, member accounts and deduplicated CRM people.',
    tables: ['profiles', 'accounts', 'crm_people', 'crm_person_roles'],
    functions: ['profiles', 'auth', 'crm'],
    status: 'live',
  },
  {
    key: 'companies',
    label: 'Companies',
    summary: 'One canonical business record, linked to unlimited events.',
    tables: ['crm_companies', 'crm_company_events'],
    functions: ['crm'],
    status: 'live',
  },
  {
    key: 'permissions',
    label: 'Permissions',
    summary: 'Server-derived identity and admin authority — sessions, live role re-validation, rate limiting.',
    tables: ['sessions', 'password_resets', 'auth_attempts'],
    functions: ['auth'],
    status: 'live',
  },
  {
    key: 'notifications',
    label: 'Notifications',
    summary: 'Member-to-member signals today (direct + group messages); broadcast/email on the roadmap.',
    tables: ['social_messages', 'social_group_messages'],
    functions: ['messages', 'groups'],
    status: 'partial',
  },
  {
    key: 'analytics',
    label: 'Analytics',
    summary: 'Executive dashboards plus the append-only audit trail of every privileged action.',
    tables: ['audit_log', 'ad_events'],
    functions: ['dashboards', 'audit-log'],
    status: 'live',
  },
]
