// platform/scheduling/contract.mjs - reusable scheduling contract.
//
// Scheduling turns opportunity into committed time. The contract must support
// public programs, private appointments, mentor office hours, event sessions,
// staffing, bookings, and reminders without binding the platform to one event
// format or one calendar provider.

export const SCHEDULING_ENTRY_TYPES = [
  {
    key: 'event-session',
    label: 'Event Session',
    purpose: 'Places talks, panels, workshops, demos, performances, and program moments on an event schedule.',
  },
  {
    key: 'appointment',
    label: 'Appointment',
    purpose: 'Lets people reserve time with a person, organization, staff member, mentor, vendor, or service.',
  },
  {
    key: 'office-hours',
    label: 'Office Hours',
    purpose: 'Creates recurring windows for mentorship, support, sales, education, or community help.',
  },
  {
    key: 'program',
    label: 'Program',
    purpose: 'Coordinates multi-session learning, volunteer, business, wellness, or community journeys.',
  },
  {
    key: 'availability-window',
    label: 'Availability Window',
    purpose: 'Defines when a person, organization, space, booth, room, or resource can be booked.',
  },
]

export const SCHEDULING_REQUIRED_FIELDS = [
  'id',
  'entryType',
  'ecosystemId',
  'title',
  'startsAt',
  'endsAt',
  'timezone',
  'hostPersonIds',
  'hostOrganizationIds',
  'location',
  'capacity',
  'visibility',
  'registrationPolicy',
  'changeHistory',
  'reminderPolicy',
  'createdAt',
  'updatedAt',
]

export const SCHEDULING_REGISTRATION_STATES = [
  'not-required',
  'open',
  'waitlist',
  'approval-required',
  'ticket-required',
  'closed',
  'cancelled',
]

export const SCHEDULING_CHANGE_CONTROLS = [
  'notify attendees',
  'publish cancellation reason',
  'track schedule edits',
  'preserve previous time',
  'require approval for public changes',
  'sync external calendar only with consent',
]

export const SCHEDULING_USER_CONTROLS = [
  'save to calendar',
  'join waitlist',
  'cancel reservation',
  'set reminder preference',
  'hide schedule recommendation',
  'reset schedule personalization',
]

export const SCHEDULING_TRUST_CONTROLS = [
  'time zone is explicit',
  'capacity is visible before registration',
  'changes are auditable',
  'AI recommendations explain fit',
  'private availability is not public',
  'calendar sync is opt-in',
]

export function schedulingContractSummary() {
  return {
    entryTypes: SCHEDULING_ENTRY_TYPES.map((type) => ({
      key: type.key,
      label: type.label,
      purpose: type.purpose,
    })),
    requiredFields: [...SCHEDULING_REQUIRED_FIELDS],
    registrationStates: [...SCHEDULING_REGISTRATION_STATES],
    changeControls: [...SCHEDULING_CHANGE_CONTROLS],
    userControls: [...SCHEDULING_USER_CONTROLS],
    trustControls: [...SCHEDULING_TRUST_CONTROLS],
  }
}
