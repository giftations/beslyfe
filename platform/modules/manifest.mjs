// platform/modules/manifest.mjs — the module catalogue.
//
// Modules are the capabilities an event can run. A theme switches a default set
// of them on (see platform/themes), but every module is always present in the
// codebase — the flags describe intent, they do not gate code. Like the core
// manifest this maps each module to the concrete function(s) and page(s) that
// already implement it, and is served via `GET events?platform`.

export const MODULES = [
  { key: 'ticketing', label: 'Ticketing', summary: 'Approval-gated package purchase; Eventbrite link unlocked after review.', functions: ['applications'], pages: ['package-access.html'] },
  { key: 'vendors', label: 'Vendors', summary: 'Vendor applications and review pipeline.', functions: ['applications'], pages: ['vendor-application.html'] },
  { key: 'sponsors', label: 'Sponsors', summary: 'Sponsor applications, tiers and CRM company links.', functions: ['applications', 'crm'], pages: ['sponsor-application.html'] },
  { key: 'speakers', label: 'Speakers', summary: 'Speaker/session applications and schedule.', functions: ['applications'], pages: ['speaker-application.html', 'education-schedule.html'] },
  { key: 'entertainment', label: 'Entertainment', summary: 'DJ / performer applications and lineup.', functions: ['applications'], pages: ['dj-application.html'] },
  { key: 'crm', label: 'CRM', summary: 'Deduplicated people & companies with roles, notes and pipeline.', functions: ['crm'], pages: [] },
  { key: 'advertising', label: 'Advertising', summary: 'Campaigns, creatives, delivery log and advertiser billing.', functions: ['ads', 'dashboards'], pages: [] },
  { key: 'community', label: 'Community', summary: 'Feed, reels, stories and member hub.', functions: ['social'], pages: ['feed.html', 'reels.html', 'stories.html', 'hub.html'] },
  { key: 'messaging', label: 'Messaging', summary: 'Direct messages and group chats.', functions: ['messages', 'groups'], pages: ['messages.html', 'groups.html'] },
  { key: 'directory', label: 'Directory', summary: 'Self-authored public profiles, searchable.', functions: ['profiles'], pages: ['directory.html', 'profile-view.html'] },
  { key: 'floorplan', label: 'Floor Plan', summary: 'Interactive, to-scale draft & published floor plan.', functions: ['floorplan'], pages: ['floorplan.html', 'floorplan-editor.html'] },
  { key: 'ai', label: 'AI', summary: 'Assistive generation and analysis. Roadmap — Netlify AI Gateway.', functions: [], pages: [] },
  { key: 'cms', label: 'CMS', summary: 'Per-page site content, theme and section order, edited in the admin.', functions: ['site-settings', 'site-media'], pages: ['admin-homepage.html'] },
]
