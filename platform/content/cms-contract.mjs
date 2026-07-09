// platform/content/cms-contract.mjs - reusable content and CMS contract.
//
// Content makes an ecosystem understandable. The contract supports pages,
// sections, media, navigation, revisions, publishing, and rollback without
// requiring source edits or hardcoded product copy.

export const CONTENT_TYPES = [
  {
    key: 'page',
    label: 'Page',
    purpose: 'Defines public, member, admin, or landing pages with configurable sections and metadata.',
  },
  {
    key: 'section',
    label: 'Section',
    purpose: 'Defines reusable page blocks such as hero, schedule, sponsors, directory, map, FAQ, or CTA areas.',
  },
  {
    key: 'media',
    label: 'Media',
    purpose: 'Stores images, documents, and other assets with ownership, alt text, visibility, and usage context.',
  },
  {
    key: 'navigation',
    label: 'Navigation',
    purpose: 'Controls ecosystem menus, footer links, member paths, admin paths, and launch-specific routing.',
  },
  {
    key: 'announcement',
    label: 'Announcement',
    purpose: 'Publishes timely operational updates, alerts, launch notices, and community messages.',
  },
]

export const CONTENT_REQUIRED_FIELDS = [
  'id',
  'contentType',
  'ecosystemId',
  'slug',
  'title',
  'status',
  'visibility',
  'locale',
  'content',
  'metadata',
  'ownerPersonIds',
  'ownerOrganizationIds',
  'revisionId',
  'publishedAt',
  'changeHistory',
  'createdAt',
  'updatedAt',
]

export const CONTENT_STATUS_STATES = [
  'draft',
  'review-needed',
  'scheduled',
  'published',
  'unpublished',
  'archived',
]

export const CONTENT_EDITOR_CONTROLS = [
  'save draft',
  'preview',
  'request review',
  'schedule publish',
  'publish',
  'unpublish',
  'rollback revision',
  'restore archived content',
]

export const CONTENT_TRUST_CONTROLS = [
  'public changes are auditable',
  'media ownership is tracked',
  'alt text is required for meaningful images',
  'AI-generated copy is labeled before publishing',
  'rollback path is available',
  'canonical URLs are explicit',
  'private content is excluded from public search',
]

export function contentCmsContractSummary() {
  return {
    contentTypes: CONTENT_TYPES.map((type) => ({
      key: type.key,
      label: type.label,
      purpose: type.purpose,
    })),
    requiredFields: [...CONTENT_REQUIRED_FIELDS],
    statusStates: [...CONTENT_STATUS_STATES],
    editorControls: [...CONTENT_EDITOR_CONTROLS],
    trustControls: [...CONTENT_TRUST_CONTROLS],
  }
}
