// platform/admin/os-contract.mjs - reusable Admin OS contract.
//
// Admin OS is the operator surface for every Beslyfe ecosystem. It should remain
// one shell with configurable workspaces, not a set of parallel dashboards per
// product. This contract names the reusable shape before more operator tooling
// is added.

export const ADMIN_WORKSPACE_TYPES = [
  {
    key: 'overview',
    label: 'Overview',
    purpose: 'Shows ecosystem health, operating priorities, and outcome-oriented dashboard cards.',
  },
  {
    key: 'content',
    label: 'Content',
    purpose: 'Lets operators edit public pages, media, themes, section order, and publishable content.',
  },
  {
    key: 'participation',
    label: 'Participation',
    purpose: 'Reviews applications, profiles, members, tickets, schedule, and event participation workflows.',
  },
  {
    key: 'relationships',
    label: 'Relationships',
    purpose: 'Manages CRM people, organizations, pipeline, follow-ups, advertising, sponsorship, and marketplace relationships.',
  },
  {
    key: 'community',
    label: 'Community',
    purpose: 'Moderates community surfaces and helps operators support healthy conversations without reading private messages.',
  },
  {
    key: 'operations',
    label: 'Operations',
    purpose: 'Exposes audit logs, system checks, integrations, readiness, rollback, and platform contract visibility.',
  },
]

export const ADMIN_REQUIRED_FIELDS = [
  'workspaceId',
  'label',
  'group',
  'moduleKey',
  'route',
  'requiredRole',
  'dataSources',
  'mutationPolicy',
  'auditActions',
  'emptyState',
]

export const ADMIN_MUTATION_POLICIES = [
  'admin-session-required',
  'same-origin-required',
  'audit-log-required',
  'input-validation-required',
  'secret-redaction-required',
  'never-trust-client-identity',
]

export const ADMIN_NAVIGATION_CONTROLS = [
  'single shell route',
  'deep links resolve to known workspaces',
  'unknown routes fall back to dashboard',
  'command palette indexes workspaces',
  'workspace groups are configurable',
  'mobile navigation remains accessible',
]

export const ADMIN_SYSTEM_SURFACES = [
  'platform contract registry',
  'module manifest registry',
  'service health checks',
  'database model summary',
  'audit log',
  'Netlify deployment links',
  'production readiness checklist',
]

export const ADMIN_TRUST_CONTROLS = [
  'admin authority is revalidated server-side',
  'private member messages are not exposed to operators by default',
  'operator notes stay operational and are not public profile data',
  'destructive actions require confirmation',
  'privileged mutations are auditable',
  'secrets never render in the browser',
  'no second admin app for a module',
  'product-specific labels remain configurable',
]

export function adminWorkspaceTypeKeys() {
  return ADMIN_WORKSPACE_TYPES.map((type) => type.key)
}

export function adminOsContractSummary() {
  return {
    workspaceTypes: ADMIN_WORKSPACE_TYPES.map((type) => ({
      key: type.key,
      label: type.label,
      purpose: type.purpose,
    })),
    requiredFields: [...ADMIN_REQUIRED_FIELDS],
    mutationPolicies: [...ADMIN_MUTATION_POLICIES],
    navigationControls: [...ADMIN_NAVIGATION_CONTROLS],
    systemSurfaces: [...ADMIN_SYSTEM_SURFACES],
    trustControls: [...ADMIN_TRUST_CONTROLS],
  }
}
