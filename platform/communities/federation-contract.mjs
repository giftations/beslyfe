// Community federation lets a separately hosted Beslyfe build participate in
// the shared network without copying its private database or weakening its
// audience rules. Public-safe profiles and contributions keep a stable origin.

export const COMMUNITY_FEDERATION_PROTOCOL = 'beslyfe-community/1'

export const FEDERATED_RECORD_TYPES = [
  { key: 'community-manifest', purpose: 'Declares the space, owner, audience rules, and bridge capabilities.' },
  { key: 'federated-profile', purpose: 'Shows one public-safe member identity with its origin and stable external id.' },
  { key: 'federated-contribution', purpose: 'Shows a public-safe post or reel without granting cross-site write authority.' },
  { key: 'account-link', purpose: 'Lets a member explicitly connect a federated profile to a canonical Beslyfe account.' },
]

export const FEDERATION_GUARDRAILS = [
  'private profile fields never cross an ecosystem boundary',
  'age-gated content requires age confirmation before retrieval',
  'origin ecosystem remains visible on every federated record',
  'federated records are read-only until an explicit account link is completed',
  'remote source URLs come from an operator allowlist',
  'an unavailable source fails independently without breaking the shared network',
]

export function communityBridgeDefaults({
  ecosystemId = '',
  minimumAge = 0,
  contentRating = 'general',
  contributionMode = 'public-opt-in',
} = {}) {
  return {
    enabled: true,
    protocolVersion: COMMUNITY_FEDERATION_PROTOCOL,
    networkId: 'beslyfe-network',
    ecosystemId,
    identityMode: 'one-profile-many-memberships',
    contributionMode,
    originAttribution: true,
    audience: {
      minimumAge: Math.max(0, Number(minimumAge || 0)),
      contentRating: String(contentRating || 'general'),
    },
    privateDataExport: false,
    accountLinkRequiredForWrites: true,
  }
}

export function communityFederationContractSummary() {
  return {
    protocolVersion: COMMUNITY_FEDERATION_PROTOCOL,
    recordTypes: FEDERATED_RECORD_TYPES.map((item) => ({ ...item })),
    guardrails: [...FEDERATION_GUARDRAILS],
    defaultBridge: communityBridgeDefaults(),
  }
}
