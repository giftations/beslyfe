// platform/places/maps-contract.mjs - reusable places and maps contract.
//
// Places turn opportunity into somewhere people can go, navigate, serve, sell,
// meet, learn, and belong. The contract supports venues, booths, rooms, service
// areas, maps, floor plans, and location-based discovery without binding the
// platform to one event layout or mapping provider.

export const PLACE_TYPES = [
  {
    key: 'venue',
    label: 'Venue',
    purpose: 'Defines a physical or virtual place that can host experiences, organizations, booths, rooms, or services.',
  },
  {
    key: 'booth',
    label: 'Booth',
    purpose: 'Assigns a discoverable location to an exhibitor, vendor, sponsor, employer, or partner.',
  },
  {
    key: 'room',
    label: 'Room',
    purpose: 'Supports sessions, appointments, workshops, office hours, screenings, and private meetings.',
  },
  {
    key: 'service-area',
    label: 'Service Area',
    purpose: 'Defines the geographic area where an organization, resource, opportunity, or program is available.',
  },
  {
    key: 'map-zone',
    label: 'Map Zone',
    purpose: 'Groups places by floor, area, neighborhood, campus, hall, category, or operational boundary.',
  },
]

export const PLACE_REQUIRED_FIELDS = [
  'id',
  'placeType',
  'ecosystemId',
  'displayName',
  'visibility',
  'address',
  'coordinates',
  'mapPosition',
  'parentPlaceId',
  'ownerOrganizationIds',
  'hostExperienceIds',
  'assignedOrganizationIds',
  'accessibility',
  'navigationNotes',
  'publishedState',
  'changeHistory',
  'createdAt',
  'updatedAt',
]

export const MAP_ARTIFACT_TYPES = [
  'published-map',
  'draft-map',
  'floor-plan',
  'booth-layout',
  'service-area-map',
  'route',
  'wayfinding-note',
]

export const PLACE_VISIBILITY_STATES = [
  'private',
  'operator-only',
  'assigned-members',
  'ecosystem-public',
  'public',
  'archived',
]

export const PLACE_USER_CONTROLS = [
  'request location correction',
  'hide private address',
  'save place',
  'get directions',
  'report accessibility issue',
  'hide place recommendation',
]

export const PLACE_TRUST_CONTROLS = [
  'draft maps stay private',
  'published map changes are auditable',
  'private addresses are hidden by default',
  'accessibility notes are visible before arrival',
  'sponsored map placement is labeled',
  'AI navigation uses published place data only',
]

export function placesMapsContractSummary() {
  return {
    placeTypes: PLACE_TYPES.map((type) => ({
      key: type.key,
      label: type.label,
      purpose: type.purpose,
    })),
    requiredFields: [...PLACE_REQUIRED_FIELDS],
    mapArtifactTypes: [...MAP_ARTIFACT_TYPES],
    visibilityStates: [...PLACE_VISIBILITY_STATES],
    userControls: [...PLACE_USER_CONTROLS],
    trustControls: [...PLACE_TRUST_CONTROLS],
  }
}
