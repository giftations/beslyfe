// platform/analytics/outcome-contract.mjs - meaningful outcome analytics.
//
// Beslyfe measures opportunity created, not empty engagement. This contract
// names the primary outcome metrics and guardrails future analytics, AI, ads,
// and marketplace features should use before optimizing any workflow.

export const OUTCOME_METRICS = [
  {
    key: 'introduction-made',
    label: 'Introduction Made',
    entity: 'relationship',
    outcome: 'Two or more people or organizations were intentionally connected.',
  },
  {
    key: 'consented-conversation-started',
    label: 'Consented Conversation Started',
    entity: 'conversation',
    outcome: 'A conversation began with mutual consent and clear context.',
  },
  {
    key: 'mentorship-connected',
    label: 'Mentorship Connected',
    entity: 'relationship',
    outcome: 'A mentor and mentee were matched around a goal or learning need.',
  },
  {
    key: 'business-partnership-created',
    label: 'Business Partnership Created',
    entity: 'organization',
    outcome: 'Organizations or people formed a business relationship.',
  },
  {
    key: 'job-or-gig-found',
    label: 'Job Or Gig Found',
    entity: 'opportunity',
    outcome: 'A person found work, a gig, vendor placement, sponsorship, or customer lead.',
  },
  {
    key: 'event-attended',
    label: 'Event Attended',
    entity: 'experience',
    outcome: 'A person attended an experience that matched their goals or interests.',
  },
  {
    key: 'community-strengthened',
    label: 'Community Strengthened',
    entity: 'community',
    outcome: 'A community gained useful participation, contribution, or support.',
  },
  {
    key: 'learning-progressed',
    label: 'Learning Progressed',
    entity: 'knowledge',
    outcome: 'A person started or completed a learning path, session, or knowledge action.',
  },
  {
    key: 'volunteer-opportunity-accepted',
    label: 'Volunteer Opportunity Accepted',
    entity: 'opportunity',
    outcome: 'A person accepted a volunteer, civic, or community support opportunity.',
  },
  {
    key: 'trust-positive-repeat-interaction',
    label: 'Trust-Positive Repeat Interaction',
    entity: 'relationship',
    outcome: 'A relationship produced repeated positive interaction without guardrail harm.',
  },
]

export const GUARDRAIL_METRICS = [
  {
    key: 'report-rate',
    label: 'Report Rate',
    risk: 'Community safety, harassment, spam, or abuse.',
  },
  {
    key: 'block-or-mute-rate',
    label: 'Block Or Mute Rate',
    risk: 'Unwanted contact or poor recommendation quality.',
  },
  {
    key: 'recommendation-hidden',
    label: 'Recommendation Hidden',
    risk: 'Irrelevant, poorly timed, or uncomfortable recommendations.',
  },
  {
    key: 'consent-withdrawal',
    label: 'Consent Withdrawal',
    risk: 'User discomfort with data use or personalization.',
  },
  {
    key: 'data-deletion-request',
    label: 'Data Deletion Request',
    risk: 'Trust, privacy, or ownership concern.',
  },
  {
    key: 'unwanted-message-rate',
    label: 'Unwanted Message Rate',
    risk: 'Conversation boundary failure.',
  },
  {
    key: 'time-without-outcome',
    label: 'Time Without Outcome',
    risk: 'Engagement without meaningful progress.',
  },
  {
    key: 'sponsored-complaint',
    label: 'Sponsored Recommendation Complaint',
    risk: 'Paid visibility harming trust or clarity.',
  },
]

export const DISALLOWED_NORTH_STAR_METRICS = [
  'time-on-site',
  'endless-scroll-depth',
  'raw-click-volume',
  'rage-engagement',
  'impressions-without-outcome',
]

export function outcomeMetricKeys() {
  return OUTCOME_METRICS.map((metric) => metric.key)
}

export function guardrailMetricKeys() {
  return GUARDRAIL_METRICS.map((metric) => metric.key)
}

export function analyticsContractSummary() {
  return {
    outcomes: OUTCOME_METRICS.map((metric) => ({
      key: metric.key,
      entity: metric.entity,
      outcome: metric.outcome,
    })),
    guardrails: GUARDRAIL_METRICS.map((metric) => ({
      key: metric.key,
      risk: metric.risk,
    })),
    disallowedNorthStars: [...DISALLOWED_NORTH_STAR_METRICS],
  }
}
