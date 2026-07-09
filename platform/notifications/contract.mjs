// platform/notifications/contract.mjs - reusable notifications contract.
//
// Notifications should reduce friction without stealing attention. The
// contract supports alerts, reminders, approvals, conversations, marketplace
// updates, moderation notices, and opportunity nudges while preserving consent,
// frequency controls, delivery preferences, and clear reasons.

export const NOTIFICATION_TYPES = [
  {
    key: 'status-update',
    label: 'Status Update',
    purpose: 'Tells a person or organization when an application, request, order, booking, or approval changes state.',
  },
  {
    key: 'reminder',
    label: 'Reminder',
    purpose: 'Helps people remember upcoming sessions, appointments, deadlines, tasks, renewals, or follow-ups.',
  },
  {
    key: 'conversation',
    label: 'Conversation',
    purpose: 'Alerts participants about consent-based messages, introductions, group activity, and replies.',
  },
  {
    key: 'opportunity',
    label: 'Opportunity',
    purpose: 'Surfaces relevant jobs, mentorship, partnerships, learning, events, services, or introductions.',
  },
  {
    key: 'trust-and-safety',
    label: 'Trust and Safety',
    purpose: 'Communicates moderation actions, policy changes, account protection, reports, and privacy events.',
  },
]

export const NOTIFICATION_REQUIRED_FIELDS = [
  'id',
  'notificationType',
  'recipientPersonId',
  'recipientOrganizationId',
  'ecosystemId',
  'sourceEntityType',
  'sourceEntityId',
  'title',
  'body',
  'reason',
  'priority',
  'deliveryChannels',
  'preferenceScope',
  'consentPurposes',
  'status',
  'createdAt',
  'updatedAt',
]

export const NOTIFICATION_DELIVERY_CHANNELS = [
  'in-app',
  'email',
  'sms',
  'push',
  'webhook',
  'admin-inbox',
]

export const NOTIFICATION_STATUS_STATES = [
  'queued',
  'sent',
  'delivered',
  'read',
  'dismissed',
  'failed',
  'suppressed',
]

export const NOTIFICATION_USER_CONTROLS = [
  'mute notification type',
  'choose delivery channels',
  'set quiet hours',
  'unsubscribe from nonessential updates',
  'hide recommendation notification',
  'reset notification personalization',
  'view notification reason',
]

export const NOTIFICATION_TRUST_CONTROLS = [
  'essential notices cannot be disguised as marketing',
  'marketing requires explicit opt-in',
  'frequency limits are enforced',
  'quiet hours are respected',
  'AI-generated notifications are labeled',
  'notification reasons are explainable',
  'private message content is not exposed in public channels',
]

export function notificationContractSummary() {
  return {
    notificationTypes: NOTIFICATION_TYPES.map((type) => ({
      key: type.key,
      label: type.label,
      purpose: type.purpose,
    })),
    requiredFields: [...NOTIFICATION_REQUIRED_FIELDS],
    deliveryChannels: [...NOTIFICATION_DELIVERY_CHANNELS],
    statusStates: [...NOTIFICATION_STATUS_STATES],
    userControls: [...NOTIFICATION_USER_CONTROLS],
    trustControls: [...NOTIFICATION_TRUST_CONTROLS],
  }
}
