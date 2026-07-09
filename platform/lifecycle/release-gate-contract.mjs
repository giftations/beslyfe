// platform/lifecycle/release-gate-contract.mjs - reusable launch and deploy gates.
//
// A Beslyfe ecosystem should go live only when trust, rollback, accessibility,
// privacy, and operational readiness are visible. This contract turns launch
// readiness into data instead of memory.

export const RELEASE_GATE_RECORD_TYPES = [
  {
    key: 'release-candidate',
    label: 'Release Candidate',
    purpose: 'Names the deploy, branch, ecosystem, owner, risk level, and release reason.',
  },
  {
    key: 'readiness-evidence',
    label: 'Readiness Evidence',
    purpose: 'Captures test output, screenshots, checklist results, monitoring links, and sign-offs.',
  },
  {
    key: 'manual-check',
    label: 'Manual Check',
    purpose: 'Tracks required human verification for flows that cannot be proven by smoke tests alone.',
  },
  {
    key: 'release-decision',
    label: 'Release Decision',
    purpose: 'Records approval, hold, rollback, or follow-up decision with owner and reason.',
  },
  {
    key: 'post-merge-verification',
    label: 'Post-Merge Verification',
    purpose: 'Tracks the second test pass, production checks, and rollback readiness after merge.',
  },
]

export const RELEASE_GATE_AREAS = [
  'dns',
  'netlify-deploy',
  'database',
  'email',
  'authentication',
  'applications',
  'profiles',
  'directory',
  'crm',
  'notifications',
  'mobile-navigation',
  'accessibility',
  'redirects',
  'analytics',
  'rollback',
]

export const RELEASE_DECISION_STATES = [
  'draft',
  'ready-for-review',
  'approved',
  'blocked',
  'deployed',
  'verified',
  'rolled-back',
  'needs-follow-up',
]

export const REQUIRED_RELEASE_GATE_FIELDS = [
  'id',
  'ecosystemId',
  'releaseName',
  'deployReference',
  'ownerAccountId',
  'riskLevel',
  'gateAreas',
  'evidence',
  'decision',
  'rollbackReference',
  'createdAt',
  'updatedAt',
]

export const RELEASE_TRUST_CONTROLS = [
  'double test after merge',
  'rollback instructions are linked',
  'manual checks are explicit',
  'secrets are not copied into evidence',
  'production checks include mobile navigation',
  'AI-facing changes require explanation and controls evidence',
  'DNS and redirects are verified before public launch',
  'release decision records owner and reason',
]

export function releaseGateRecordTypeKeys() {
  return RELEASE_GATE_RECORD_TYPES.map((type) => type.key)
}

export function releaseGateContractSummary() {
  return {
    recordTypes: RELEASE_GATE_RECORD_TYPES.map((type) => ({
      key: type.key,
      purpose: type.purpose,
    })),
    gateAreas: [...RELEASE_GATE_AREAS],
    decisionStates: [...RELEASE_DECISION_STATES],
    requiredFields: [...REQUIRED_RELEASE_GATE_FIELDS],
    trustControls: [...RELEASE_TRUST_CONTROLS],
  }
}
