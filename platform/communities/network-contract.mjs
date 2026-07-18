// The Beslyfe network is the shared community layer across every ecosystem.
// A person has one identity, may join many ecosystems, and keeps their
// relationships when a business, event, website, or community grows.

export const BESLYFE_NETWORK_ID = 'beslyfe-network'

export const NETWORK_RECORD_TYPES = [
  { key: 'network-profile', purpose: 'One member identity shared across every joined ecosystem.' },
  { key: 'ecosystem-membership', purpose: 'A many-to-many link between one profile and one ecosystem.' },
  { key: 'origin-attribution', purpose: 'Records where a member or public contribution entered the network.' },
  { key: 'community-contribution', purpose: 'A post, reel, story, message-safe signal, success story, or resource shared into the network.' },
]

export const NETWORK_GROWTH_RULES = [
  'every verified Beslyfe account joins the shared network',
  'ecosystem members keep one profile and relationship graph',
  'public ecosystem posts may flow into the shared feed with their origin shown',
  'private posts and messages never leave their chosen audience',
  'a new ecosystem grows the shared network instead of creating a disconnected user silo',
  'proof-ecosystem members remain members of the shared Beslyfe network',
]

export const NETWORK_USER_CONTROLS = [
  'see a contribution origin',
  'choose global, ecosystem, followers, or private visibility',
  'leave an ecosystem without deleting the shared identity',
  'mute an ecosystem or member',
  'export profile and contribution data',
]

export const NETWORK_SUCCESS_SIGNALS = [
  'success stories shared',
  'members helped',
  'introductions accepted',
  'business referrals created',
  'sales opportunities created',
  'collaborations completed',
]

export function communityNetworkContractSummary() {
  return {
    networkId: BESLYFE_NETWORK_ID,
    recordTypes: NETWORK_RECORD_TYPES.map((item) => ({ ...item })),
    growthRules: [...NETWORK_GROWTH_RULES],
    userControls: [...NETWORK_USER_CONTROLS],
    successSignals: [...NETWORK_SUCCESS_SIGNALS],
  }
}
