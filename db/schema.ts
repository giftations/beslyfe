import { boolean, customType, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Raw binary column. Image and video bytes are stored directly in Postgres
// (instead of Netlify Blobs) so every piece of the site's data lives in one
// place — the database.
const bytea = customType<{ data: Buffer }>({
  dataType() {
    return "bytea";
  },
});

// ── Ecosystems ──
// The platform tenant is deliberately broader than an event. A business,
// website, creator, nonprofit, community, or event is an ecosystem with a
// capability plan. Every ecosystem participates in the shared Beslyfe network.
export const ecosystems = pgTable("ecosystems", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().default(""),
  name: text("name").notNull().default(""),
  description: text("description").notNull().default(""),
  productType: text("product_type").notNull().default("website"),
  primaryOutcome: text("primary_outcome").notNull().default("community-growth"),
  ownerProfileId: text("owner_profile_id").notNull().default(""),
  parentEcosystemId: text("parent_ecosystem_id").notNull().default("beslyfe-network"),
  status: text("status").notNull().default("draft"),
  visibility: text("visibility").notNull().default("public"),
  capabilities: jsonb("capabilities").notNull().default([]),
  answers: jsonb("answers").notNull().default({}),
  settings: jsonb("settings").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("ecosystems_slug_idx").on(t.slug),
  index("ecosystems_owner_idx").on(t.ownerProfileId),
  index("ecosystems_product_idx").on(t.productType, t.status),
]);

export const ecosystemMemberships = pgTable("ecosystem_memberships", {
  ecosystemId: text("ecosystem_id").notNull(),
  profileId: text("profile_id").notNull(),
  role: text("role").notNull().default("member"),
  source: text("source").notNull().default("direct"),
  status: text("status").notNull().default("active"),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.ecosystemId, t.profileId] }),
  index("ecosystem_memberships_profile_idx").on(t.profileId, t.status),
]);

export const growthChannels = pgTable("growth_channels", {
  id: text("id").primaryKey(),
  ecosystemId: text("ecosystem_id").notNull().default(""),
  ownerProfileId: text("owner_profile_id").notNull().default(""),
  mode: text("mode").notNull().default("lead"),
  provider: text("provider").notNull().default("contact-form"),
  offerName: text("offer_name").notNull().default(""),
  actionLabel: text("action_label").notNull().default("Get started"),
  destinationUrl: text("destination_url").notNull().default(""),
  status: text("status").notNull().default("draft"),
  attribution: jsonb("attribution").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("growth_channels_ecosystem_idx").on(t.ecosystemId, t.status),
  index("growth_channels_owner_idx").on(t.ownerProfileId),
]);

export const ecosystemActionPlans = pgTable("ecosystem_action_plans", {
  id: text("id").primaryKey(),
  ecosystemId: text("ecosystem_id").notNull().default(""),
  ownerProfileId: text("owner_profile_id").notNull().default(""),
  version: integer("version").notNull().default(1),
  status: text("status").notNull().default("active"),
  summary: jsonb("summary").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("ecosystem_action_plans_ecosystem_idx").on(t.ecosystemId),
  index("ecosystem_action_plans_owner_idx").on(t.ownerProfileId, t.status),
]);

export const ecosystemActionTasks = pgTable("ecosystem_action_tasks", {
  id: text("id").primaryKey(),
  planId: text("plan_id").notNull().default(""),
  ecosystemId: text("ecosystem_id").notNull().default(""),
  ownerProfileId: text("owner_profile_id").notNull().default(""),
  dayNumber: integer("day_number").notNull().default(1),
  sequence: integer("sequence").notNull().default(1),
  actionKey: text("action_key").notNull().default(""),
  title: text("title").notNull().default(""),
  description: text("description").notNull().default(""),
  mode: text("mode").notNull().default("internal"),
  status: text("status").notNull().default("queued"),
  requiresApproval: boolean("requires_approval").notNull().default(false),
  dependsOnTaskId: text("depends_on_task_id").notNull().default(""),
  input: jsonb("input").notNull().default({}),
  approvalPreview: jsonb("approval_preview").notNull().default({}),
  result: jsonb("result").notNull().default({}),
  evidence: jsonb("evidence").notNull().default([]),
  failureReason: text("failure_reason").notNull().default(""),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  approvalExpiresAt: timestamp("approval_expires_at", { withTimezone: true }),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("ecosystem_action_tasks_plan_day_idx").on(t.planId, t.dayNumber),
  index("ecosystem_action_tasks_ecosystem_idx").on(t.ecosystemId, t.status, t.sequence),
  index("ecosystem_action_tasks_owner_idx").on(t.ownerProfileId, t.status),
]);

export const ecosystemActionEvents = pgTable("ecosystem_action_events", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull().default(""),
  planId: text("plan_id").notNull().default(""),
  ecosystemId: text("ecosystem_id").notNull().default(""),
  actorProfileId: text("actor_profile_id").notNull().default(""),
  eventType: text("event_type").notNull().default(""),
  fromStatus: text("from_status").notNull().default(""),
  toStatus: text("to_status").notNull().default(""),
  details: jsonb("details").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("ecosystem_action_events_task_idx").on(t.taskId, t.createdAt),
  index("ecosystem_action_events_ecosystem_idx").on(t.ecosystemId, t.createdAt),
]);

export const ecosystemOutcomes = pgTable("ecosystem_outcomes", {
  id: text("id").primaryKey(),
  ecosystemId: text("ecosystem_id").notNull().default(""),
  ownerProfileId: text("owner_profile_id").notNull().default(""),
  metricKey: text("metric_key").notNull().default(""),
  value: integer("value").notNull().default(0),
  note: text("note").notNull().default(""),
  source: text("source").notNull().default("member"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("ecosystem_outcomes_ecosystem_idx").on(t.ecosystemId, t.metricKey, t.createdAt),
  index("ecosystem_outcomes_owner_idx").on(t.ownerProfileId, t.createdAt),
]);

// ── Events ──
// Optional event records for ecosystems that explicitly enable event tools.
// Websites, businesses, creators, communities, and causes do not need one.
// Event-scoped applications, schedules, and ticketing can point back here.
export const events = pgTable("events", {
  id: text("id").primaryKey(),
  ecosystemId: text("ecosystem_id").notNull().default(""),
  slug: text("slug").notNull().default(""),
  name: text("name").notNull().default(""),
  tagline: text("tagline").notNull().default(""),
  venue: text("venue").notNull().default(""),
  location: text("location").notNull().default(""),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  // planning · active · archived — the lifecycle of an edition.
  status: text("status").notNull().default("planning"),
  // The single current edition. Enforced to one row by the events function.
  isActive: boolean("is_active").notNull().default(false),
  // Per-event configuration (theme, ticketing links, feature flags) so each
  // edition can diverge without a schema change.
  settings: jsonb("settings").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("events_slug_idx").on(t.slug),
  index("events_active_idx").on(t.isActive),
]);

export const applications = pgTable("applications", {
  id: text("id").primaryKey(),
  // The edition this application belongs to. Backfilled to the flagship event
  // for pre-existing rows; new submissions stamp the active event automatically.
  eventId: text("event_id").notNull().default(""),
  type: text("type").notNull().default("other"),
  name: text("name").notNull().default(""),
  email: text("email").notNull().default(""),
  status: text("status").notNull().default("pending"),
  fields: jsonb("fields").notNull().default({}),
  // Admin-only workflow metadata. `internalNotes` is private staff commentary
  // that never leaves the admin. `timeline` is an append-only activity log
  // (status changes, notes, emails) rendered in the application review drawer.
  internalNotes: text("internal_notes").notNull().default(""),
  timeline: jsonb("timeline").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("applications_event_idx").on(t.eventId),
]);

// Public, self-authored profiles for vendors, sponsors, speakers and attendees.
// Anyone can create one from the site; approved profiles appear in the public
// directory. Free-form extras (social links, booth number, talk title, …) live
// in the jsonb `details` map so the schema stays stable as forms evolve.
export const profiles = pgTable("profiles", {
  id: text("id").primaryKey(),
  homeEcosystemId: text("home_ecosystem_id").notNull().default("beslyfe-network"),
  // The edition this profile belongs to (see events). Backfilled to the flagship
  // event for existing rows; new profiles stamp the active event automatically.
  eventId: text("event_id").notNull().default(""),
  role: text("role").notNull().default("attendee"),
  displayName: text("display_name").notNull().default(""),
  email: text("email").notNull().default(""),
  company: text("company").notNull().default(""),
  tagline: text("tagline").notNull().default(""),
  bio: text("bio").notNull().default(""),
  website: text("website").notNull().default(""),
  headshotUrl: text("headshot_url").notNull().default(""),
  status: text("status").notNull().default("approved"),
  details: jsonb("details").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("profiles_event_idx").on(t.eventId),
]);

// ── Social platform ──
// Lightweight social graph layered on top of profiles: profiles author posts,
// like and comment on them, and follow one another. Identity is the profile id;
// there is no separate user table.

// A post is the unit of everything published to the feed. `postType` widens it
// into three Facebook-style formats sharing one table:
//   • post  — a normal feed entry (text + optional image/video)
//   • reel  — a short video, surfaced in the vertical Reels player
//   • story — an ephemeral card that auto-hides after `expiresAt` (24h)
// `videoUrl` carries reel/video media; `filter` is the CSS filter preset chosen
// in the studio; `music` is a royalty-free, procedurally-generated track id;
// `visibility` is public | followers | private; `location` is an optional
// { lat, lng, label, visibility } map for places shared on the community map.
export const socialPosts = pgTable("social_posts", {
  id: text("id").primaryKey(),
  ecosystemId: text("ecosystem_id").notNull().default("beslyfe-network"),
  authorId: text("author_id").notNull().default(""),
  body: text("body").notNull().default(""),
  imageUrl: text("image_url").notNull().default(""),
  postType: text("post_type").notNull().default("post"),
  videoUrl: text("video_url").notNull().default(""),
  filter: text("filter").notNull().default(""),
  music: text("music").notNull().default(""),
  visibility: text("visibility").notNull().default("public"),
  location: jsonb("location").notNull().default({}),
  sourceTaskId: text("source_task_id").notNull().default(""),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("social_posts_author_idx").on(t.authorId),
  index("social_posts_created_idx").on(t.createdAt),
  index("social_posts_type_idx").on(t.postType),
  index("social_posts_ecosystem_idx").on(t.ecosystemId, t.createdAt),
  uniqueIndex("social_posts_source_task_idx").on(t.sourceTaskId).where(sql`${t.sourceTaskId} <> ''`),
]);

export const socialComments = pgTable("social_comments", {
  id: text("id").primaryKey(),
  postId: text("post_id").notNull().default(""),
  authorId: text("author_id").notNull().default(""),
  body: text("body").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("social_comments_post_idx").on(t.postId),
]);

export const socialLikes = pgTable("social_likes", {
  postId: text("post_id").notNull(),
  profileId: text("profile_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.postId, t.profileId] }),
]);

export const socialFollows = pgTable("social_follows", {
  followerId: text("follower_id").notNull(),
  followeeId: text("followee_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.followerId, t.followeeId] }),
  index("social_follows_followee_idx").on(t.followeeId),
  index("social_follows_follower_idx").on(t.followerId),
]);

// ── Accounts ──
// A login credential tied to exactly one community profile. Signing up creates
// both an account (email + password) and its linked profile in one step, so a
// member uses a single password and their profile *is* their identity across
// the directory, the feed and direct messages. `email_lower` is uniquely
// indexed for case-insensitive "already registered" checks.
// `username`/`username_lower` are optional: a member may sign in with either
// their email or a chosen username. They are nullable (not `''`) so the unique
// index can permit any number of accounts without a username — in Postgres a
// unique index treats NULLs as distinct — while still guaranteeing that any
// two *set* usernames never collide (case-insensitively via `username_lower`).
export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  email: text("email").notNull().default(""),
  emailLower: text("email_lower").notNull().default(""),
  username: text("username"),
  usernameLower: text("username_lower"),
  name: text("name").notNull().default(""),
  role: text("role").notNull().default("attendee"),
  status: text("status").notNull().default("approved"),
  // Whether the account's email address has been confirmed. Defaults to true so
  // every pre-existing account (and admin/application-created accounts, which are
  // gated by admin approval rather than a link) stays usable. Direct self-service
  // sign-ups are created with this set to false and cannot sign in until they
  // click the verification link e-mailed to them — this is what stops bots from
  // minting working accounts with addresses they don't control.
  emailVerified: boolean("email_verified").notNull().default(true),
  passwordHash: text("password_hash").notNull().default(""),
  passwordSalt: text("password_salt").notNull().default(""),
  profileId: text("profile_id").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("accounts_email_lower_idx").on(t.emailLower),
  uniqueIndex("accounts_username_lower_idx").on(t.usernameLower),
]);

// ── Sessions ──
// Server-side login sessions. On sign-in the auth function mints a random,
// opaque token, stores it here bound to the account/profile/role, and sets it
// as an httpOnly cookie. Every function derives the acting identity by looking
// the cookie's token up here — identity is never trusted from the request body.
// Rows past `expires_at` are treated as invalid and swept lazily.
export const sessions = pgTable("sessions", {
  token: text("token").primaryKey(),
  accountId: text("account_id").notNull().default(""),
  profileId: text("profile_id").notNull().default(""),
  role: text("role").notNull().default("attendee"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (t) => [
  index("sessions_account_idx").on(t.accountId),
  index("sessions_expires_idx").on(t.expiresAt),
]);

// ── Password resets ──
// Single-use, expiring tokens backing the forgot/reset-password flow. Only the
// SHA-256 hash of the token is stored, so a database read can never recover a
// live reset link. `used_at` marks a token spent so it cannot be replayed.
export const passwordResets = pgTable("password_resets", {
  tokenHash: text("token_hash").primaryKey(),
  accountId: text("account_id").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
}, (t) => [
  index("password_resets_account_idx").on(t.accountId),
]);

// ── Email verifications ──
// Single-use, expiring tokens backing the direct sign-up verification flow. A
// self-service sign-up creates an unverified, pending account and stores the
// SHA-256 hash of a random token here (never the token itself, so a database
// read can't recover a live link); the token is e-mailed as a link. Clicking it
// confirms the address, activates the account and marks the row `used_at` so it
// can't be replayed. Mirrors `password_resets` in shape and lifecycle.
export const emailVerifications = pgTable("email_verifications", {
  tokenHash: text("token_hash").primaryKey(),
  accountId: text("account_id").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
}, (t) => [
  index("email_verifications_account_idx").on(t.accountId),
]);

// ── Direct messages ──
// Private one-to-one messages between two profiles. A conversation is just every
// row where the two profile ids appear as sender/recipient in either direction.
export const socialMessages = pgTable("social_messages", {
  id: text("id").primaryKey(),
  senderId: text("sender_id").notNull().default(""),
  recipientId: text("recipient_id").notNull().default(""),
  body: text("body").notNull().default(""),
  // Optional attached photo or video. `mediaUrl` points at the media-serving
  // function (the same bytes-in-Postgres library used by posts, reels and group
  // chats); `mediaKind` is 'image' or 'video' so the client can render the right
  // element. Empty strings mean a text-only message.
  mediaUrl: text("media_url").notNull().default(""),
  mediaKind: text("media_kind").notNull().default(""),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("social_messages_sender_idx").on(t.senderId),
  index("social_messages_recipient_idx").on(t.recipientId),
  index("social_messages_pair_idx").on(t.senderId, t.recipientId),
]);

// ── Media library ──
// Every image or video a member uploads in the studio is indexed here so they
// have a personal, reusable library. The bytes now live directly in the `data`
// (bytea) column of this same row — no separate object store — and `url` points
// at the media-serving function. `filter` records the look baked in at upload
// time so it can be re-applied or shown as a badge.
export const socialMedia = pgTable("social_media", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull().default(""),
  kind: text("kind").notNull().default("image"),
  url: text("url").notNull().default(""),
  caption: text("caption").notNull().default(""),
  filter: text("filter").notNull().default(""),
  contentType: text("content_type").notNull().default(""),
  data: bytea("data"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("social_media_owner_idx").on(t.ownerId),
  index("social_media_created_idx").on(t.createdAt),
]);

// ── Group chats ──
// Member-created chat groups. A group has an owner, a set of members and a
// stream of messages. `isPrivate` controls whether it is discoverable: public
// groups can be browsed and joined by anyone, private groups are invite-only.
export const socialGroups = pgTable("social_groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull().default(""),
  description: text("description").notNull().default(""),
  ownerId: text("owner_id").notNull().default(""),
  avatarUrl: text("avatar_url").notNull().default(""),
  isPrivate: text("is_private").notNull().default("false"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("social_groups_owner_idx").on(t.ownerId),
]);

export const socialGroupMembers = pgTable("social_group_members", {
  groupId: text("group_id").notNull(),
  profileId: text("profile_id").notNull(),
  role: text("role").notNull().default("member"),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.groupId, t.profileId] }),
  index("social_group_members_profile_idx").on(t.profileId),
]);

export const socialGroupMessages = pgTable("social_group_messages", {
  id: text("id").primaryKey(),
  groupId: text("group_id").notNull().default(""),
  senderId: text("sender_id").notNull().default(""),
  body: text("body").notNull().default(""),
  mediaUrl: text("media_url").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("social_group_messages_group_idx").on(t.groupId),
]);

// ── Shared locations ──
// A member's current shared place. One row per profile. `visibility` is
// public (anyone, shown on the community map), followers (followers only) or
// private (only the member — a personal pin). Updating re-shares the place.
export const socialLocations = pgTable("social_locations", {
  profileId: text("profile_id").primaryKey(),
  lat: text("lat").notNull().default(""),
  lng: text("lng").notNull().default(""),
  label: text("label").notNull().default(""),
  visibility: text("visibility").notNull().default("public"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Site settings ──
// One JSON document per page describing every admin-controlled setting that
// publishes to the live site (hero, theme, copy overrides, section order, …).
// Replaces the former Netlify Blobs "site-config" store so all of the site's
// data lives in the database. `page` is the slug ('homepage', …); `data` holds
// the full settings document.
export const siteSettings = pgTable("site_settings", {
  page: text("page").primaryKey(),
  data: jsonb("data").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Floor plan ──
// The fully customizable event floor plan, replacing the former Blobs
// "floorplan" store. One row per key: 'draft' (the admin working copy) and
// 'published' (what the public viewer reads). `data` is the layout document.
export const floorplan = pgTable("floorplan", {
  key: text("key").primaryKey(),
  data: jsonb("data").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Site media ──
// Site-wide media library (images and video) used across the public pages and
// the admin homepage editor. Bytes are stored directly in the `data` (bytea)
// column instead of Netlify Blobs, keeping everything in one place. The bytes
// are served by the site-media function with the recorded `content_type`.
export const siteMedia = pgTable("site_media", {
  id: text("id").primaryKey(),
  name: text("name").notNull().default(""),
  contentType: text("content_type").notNull().default(""),
  kind: text("kind").notNull().default("image"),
  data: bytea("data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("site_media_created_idx").on(t.createdAt),
]);

// ── Notifications ──
// A member's activity inbox, in the style of Facebook/Instagram. One row per
// event that concerns a member: someone sent them a direct or group message,
// a person they follow published a new post, or their own post was liked or
// commented on, or someone followed them. `recipientId` and `actorId` are
// profile ids. `type` names the event (message · group · post · like · comment ·
// follow). `postId`/`messageId` point at the subject when relevant, `body` is a
// short preview, and `link` is where clicking the notification should navigate.
// `readAt` is null until the member opens their notifications, which powers the
// unread badge. Rows are only inserted (and swept when read/old), never mutated
// beyond marking read.
export const notifications = pgTable("notifications", {
  id: text("id").primaryKey(),
  recipientId: text("recipient_id").notNull().default(""),
  actorId: text("actor_id").notNull().default(""),
  type: text("type").notNull().default(""),
  postId: text("post_id").notNull().default(""),
  messageId: text("message_id").notNull().default(""),
  body: text("body").notNull().default(""),
  link: text("link").notNull().default(""),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("notifications_recipient_idx").on(t.recipientId, t.createdAt),
  index("notifications_recipient_read_idx").on(t.recipientId, t.readAt),
]);

// ── Notification preferences ──
// One row per member controlling what lands in their notifications, so they can
// opt out — either entirely (`muted`) or per category. `prefs` is a small JSON
// map of type → boolean; an absent key means that category is enabled, so a
// member with no row (the default) receives everything. The notification writer
// consults this before ever inserting a row, so an opted-out member is never
// notified in the first place.
export const notificationPrefs = pgTable("notification_prefs", {
  profileId: text("profile_id").primaryKey(),
  muted: boolean("muted").notNull().default(false),
  prefs: jsonb("prefs").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Audit log ──
// Append-only record of every privileged admin mutation (application review,
// event lifecycle changes, …). Each row names the actor, the action, the
// resource it touched and a small JSON diff of what changed, so the platform has
// an accountable, tamper-evident history for operations, compliance and support.
// Rows are only ever inserted — never updated or deleted by application code.
export const auditLog = pgTable("audit_log", {
  id: text("id").primaryKey(),
  actorAccountId: text("actor_account_id").notNull().default(""),
  actorName: text("actor_name").notNull().default(""),
  action: text("action").notNull().default(""),
  resourceType: text("resource_type").notNull().default(""),
  resourceId: text("resource_id").notNull().default(""),
  // Small structured summary of the change, e.g. { before, after } for a status.
  details: jsonb("details").notNull().default({}),
  ip: text("ip").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("audit_log_created_idx").on(t.createdAt),
  index("audit_log_resource_idx").on(t.resourceType, t.resourceId),
  index("audit_log_actor_idx").on(t.actorAccountId),
]);

// ── CRM: People & Companies ──
// A normalized customer-relationship layer sitting alongside the public-facing
// `profiles`/`applications` tables. Its entire reason to exist is *no duplicated
// data*: the same human who submits a vendor application, later signs up as a
// speaker, and attends next year is a single `crm_people` row — not three. The
// organization they represent is a single `crm_companies` row referenced by id,
// not a free-text `company` string copied onto every profile.
//
// The shape encodes the model directly:
//   • One person, unlimited roles  → crm_people 1—* crm_person_roles
//   • One company, unlimited events → crm_companies 1—* crm_company_events
//   • A person belongs to one company → crm_people.company_id (a reference, so a
//     company's name/website/industry is stored once and never copied).
//
// Dedup is enforced by two unique keys. `email_key` is the lowercased email, or
// the row id when the person has no email — so real emails can never collide
// while anonymous people still coexist. `name_key` does the same for companies
// (normalized name, or the id when unnamed). Application code upserts against
// these keys, so importing the existing profiles/applications collapses repeats
// into one canonical record each.

export const crmCompanies = pgTable("crm_companies", {
  id: text("id").primaryKey(),
  name: text("name").notNull().default(""),
  // Dedup key: normalized name, or the id when the company is unnamed. Unique.
  nameKey: text("name_key").notNull().default(""),
  website: text("website").notNull().default(""),
  industry: text("industry").notNull().default(""),
  notes: text("notes").notNull().default(""),
  details: jsonb("details").notNull().default({}),
  status: text("status").notNull().default("new"),
  tags: jsonb("tags").notNull().default([]),
  leadSource: text("lead_source").notNull().default("other"),
  pipelineStage: text("pipeline_stage").notNull().default("new"),
  ownerAccountId: text("owner_account_id").notNull().default(""),
  followUpAt: timestamp("follow_up_at", { withTimezone: true }),
  lastContactedAt: timestamp("last_contacted_at", { withTimezone: true }),
  lifetimeValueCents: integer("lifetime_value_cents").notNull().default(0),
  priority: text("priority").notNull().default("normal"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("crm_companies_name_key_idx").on(t.nameKey),
  index("crm_companies_pipeline_idx").on(t.pipelineStage),
  index("crm_companies_status_idx").on(t.status),
  index("crm_companies_owner_idx").on(t.ownerAccountId),
  index("crm_companies_follow_up_idx").on(t.followUpAt),
]);

export const crmPeople = pgTable("crm_people", {
  id: text("id").primaryKey(),
  fullName: text("full_name").notNull().default(""),
  email: text("email").notNull().default(""),
  // Dedup key: lowercased email, or the id when the person has no email. Unique,
  // so the same email can never produce two people, but many people may have none.
  emailKey: text("email_key").notNull().default(""),
  phone: text("phone").notNull().default(""),
  // The one company this person represents (see crm_companies). A reference, not a
  // copied name — updating the company updates it everywhere at once.
  companyId: text("company_id").notNull().default(""),
  title: text("title").notNull().default(""),
  notes: text("notes").notNull().default(""),
  details: jsonb("details").notNull().default({}),
  status: text("status").notNull().default("new"),
  tags: jsonb("tags").notNull().default([]),
  leadSource: text("lead_source").notNull().default("other"),
  pipelineStage: text("pipeline_stage").notNull().default("new"),
  ownerAccountId: text("owner_account_id").notNull().default(""),
  followUpAt: timestamp("follow_up_at", { withTimezone: true }),
  lastContactedAt: timestamp("last_contacted_at", { withTimezone: true }),
  lifetimeValueCents: integer("lifetime_value_cents").notNull().default(0),
  priority: text("priority").notNull().default("normal"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("crm_people_email_key_idx").on(t.emailKey),
  index("crm_people_company_idx").on(t.companyId),
  index("crm_people_pipeline_idx").on(t.pipelineStage),
  index("crm_people_status_idx").on(t.status),
  index("crm_people_owner_idx").on(t.ownerAccountId),
  index("crm_people_follow_up_idx").on(t.followUpAt),
]);

// Unified CRM timeline. Notes, calls, emails, tasks, payments, applications,
// sponsorships and ad context all land here so a person or company detail view
// tells the whole relationship story without duplicating workflows.
export const crmActivities = pgTable("crm_activities", {
  id: text("id").primaryKey(),
  subjectType: text("subject_type").notNull().default("person"),
  subjectId: text("subject_id").notNull().default(""),
  eventId: text("event_id").notNull().default(""),
  actorAccountId: text("actor_account_id").notNull().default(""),
  kind: text("kind").notNull().default("note"),
  title: text("title").notNull().default(""),
  body: text("body").notNull().default(""),
  dueAt: timestamp("due_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  details: jsonb("details").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("crm_activities_subject_idx").on(t.subjectType, t.subjectId, t.createdAt),
  index("crm_activities_due_idx").on(t.dueAt, t.completedAt),
  index("crm_activities_event_idx").on(t.eventId),
]);

// A person's roles — attendee, vendor, sponsor, speaker, dj, organizer, … — with
// no limit on how many they hold. Each role may be scoped to an event edition
// (`event_id`) so someone can be a speaker in 2026 and a sponsor in 2027 without
// duplicating the person. The unique (person, role, event) index makes a role
// idempotent: granting the same role twice is a no-op, never a duplicate row.
export const crmPersonRoles = pgTable("crm_person_roles", {
  id: text("id").primaryKey(),
  personId: text("person_id").notNull().default(""),
  role: text("role").notNull().default("attendee"),
  eventId: text("event_id").notNull().default(""),
  status: text("status").notNull().default("active"),
  details: jsonb("details").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("crm_person_roles_unique_idx").on(t.personId, t.role, t.eventId),
  index("crm_person_roles_person_idx").on(t.personId),
  index("crm_person_roles_event_idx").on(t.eventId),
  index("crm_person_roles_role_idx").on(t.role),
]);

// A company's participation in event editions — no limit on how many. Each link
// carries the nature of the participation (exhibitor, sponsor, partner, …). The
// unique (company, event) index keeps a company linked to any one edition once.
export const crmCompanyEvents = pgTable("crm_company_events", {
  id: text("id").primaryKey(),
  companyId: text("company_id").notNull().default(""),
  eventId: text("event_id").notNull().default(""),
  relationship: text("relationship").notNull().default("exhibitor"),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("crm_company_events_unique_idx").on(t.companyId, t.eventId),
  index("crm_company_events_company_idx").on(t.companyId),
  index("crm_company_events_event_idx").on(t.eventId),
]);

// ── Auth attempts ──
// Throttling ledger for the authentication surface (login, signup, password
// reset, package-access lookup). One row per attempt, keyed by a coarse bucket
// (action + client IP, or action + email), counted within a short sliding
// window to rate-limit brute-force and enumeration. Rows are swept once they
// age past the window, so the table stays small.
export const authAttempts = pgTable("auth_attempts", {
  id: text("id").primaryKey(),
  bucket: text("bucket").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("auth_attempts_bucket_idx").on(t.bucket, t.createdAt),
  index("auth_attempts_created_idx").on(t.createdAt),
]);

// ── Advertising ──
// A first-class advertising platform layered on the same Event OS tenancy and the
// CRM. It sells and serves inventory — homepage banners, directory ads, featured
// vendors and email sponsorships — while tracking delivery (impressions/clicks),
// scheduling, expiration, and billing.
//
// The advertiser is NOT a new entity: a campaign references a canonical
// `crm_companies` row by id, so an advertiser's name/website/industry lives in
// exactly one place and the same organization that exhibits, sponsors and buys
// ads is one record. Everything is event-scoped like the rest of the platform.
//
//   • ad_campaigns  — one advertiser buy, scheduled, priced and status-driven
//   • ad_creatives  — the renderable units of a campaign, one per placement slot
//   • ad_events     — append-only impression/click log powering analytics
//   • ad_invoices   — billing documents generated from a campaign

// A campaign is the sellable unit: an advertiser (crm company) running for a
// date range against an event edition. `status` drives eligibility to serve —
// only `active` campaigns inside their [startsAt, endsAt] window deliver.
// `priority` is the serving weight when several campaigns compete for one slot.
// Money is stored as integer cents to avoid floating-point drift; `rateType`
// records how it was priced (flat fee, CPM, or CPC) for reporting.
export const adCampaigns = pgTable("ad_campaigns", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().default(""),
  // The advertiser — a reference to a canonical CRM company, never a copied name.
  companyId: text("company_id").notNull().default(""),
  name: text("name").notNull().default(""),
  // draft · scheduled · active · paused · completed · archived
  status: text("status").notNull().default("draft"),
  // How the buy was priced: flat | cpm | cpc. Amounts are in `rateAmountCents`
  // (and `budgetCents` as an optional cap), both integer cents.
  rateType: text("rate_type").notNull().default("flat"),
  rateAmountCents: integer("rate_amount_cents").notNull().default(0),
  budgetCents: integer("budget_cents").notNull().default(0),
  // Serving weight — higher wins more often when slots compete. Default 1.
  priority: integer("priority").notNull().default(1),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  notes: text("notes").notNull().default(""),
  details: jsonb("details").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("ad_campaigns_event_idx").on(t.eventId),
  index("ad_campaigns_company_idx").on(t.companyId),
  index("ad_campaigns_status_idx").on(t.status),
]);

// A creative is what actually renders in a slot. One campaign has many creatives,
// one (or more) per `placement`. `placement` names the inventory slot:
//   homepage_banner · directory · featured_vendor · email_sponsor · sidebar
// For a `featured_vendor` buy, `profileId` points at the directory profile being
// promoted so it can be rendered/linked without copying its content.
export const adCreatives = pgTable("ad_creatives", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id").notNull().default(""),
  placement: text("placement").notNull().default("homepage_banner"),
  headline: text("headline").notNull().default(""),
  body: text("body").notNull().default(""),
  imageUrl: text("image_url").notNull().default(""),
  ctaLabel: text("cta_label").notNull().default(""),
  // The advertiser's landing URL. The click tracker redirects here after logging.
  targetUrl: text("target_url").notNull().default(""),
  // For featured_vendor placements: the promoted directory profile.
  profileId: text("profile_id").notNull().default(""),
  weight: integer("weight").notNull().default(1),
  // active · paused — a paused creative never serves even if its campaign is live.
  status: text("status").notNull().default("active"),
  details: jsonb("details").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("ad_creatives_campaign_idx").on(t.campaignId),
  index("ad_creatives_placement_idx").on(t.placement),
]);

// Append-only delivery log. One row per impression or click, written by the
// public serving/click endpoints. Analytics (CTR, delivery by placement, top
// campaigns) are aggregated from this table. Only ever inserted, never updated.
export const adEvents = pgTable("ad_events", {
  id: text("id").primaryKey(),
  creativeId: text("creative_id").notNull().default(""),
  campaignId: text("campaign_id").notNull().default(""),
  placement: text("placement").notNull().default(""),
  // impression | click
  kind: text("kind").notNull().default("impression"),
  eventId: text("event_id").notNull().default(""),
  path: text("path").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("ad_events_campaign_idx").on(t.campaignId, t.kind),
  index("ad_events_creative_idx").on(t.creativeId),
  index("ad_events_created_idx").on(t.createdAt),
]);

// ── Ticketing ──
// Ingestion of ticket sales from external ticketing companies (Eventbrite, AXS,
// Ticketmaster, DICE, Universe, …) so paid attendance flows into the platform
// automatically and updates every part of the site — the executive dashboards,
// revenue, analytics, finance and the attendee picture — without anyone
// re-keying a spreadsheet.
//
// The model is provider-agnostic by design. A `ticket_providers` row is one
// configured integration: it publishes a signing-free *ingest token* (only its
// SHA-256 hash is stored, never the token itself) that a ticketing company — or
// a lightweight relay like Zapier/Make, or their own CSV export — posts orders
// to. Every incoming order lands in `ticket_orders` as one canonical row, keyed
// by a `dedup_key` so re-delivering the same order (webhooks retry; a daily
// digest re-sends the day) updates in place instead of double-counting. Money is
// integer cents throughout, mirroring the advertising tables, so nothing rounds
// adrift when it is summed into revenue.
export const ticketProviders = pgTable("ticket_providers", {
  id: text("id").primaryKey(),
  // The edition these sales belong to (see events). Stamped with the active
  // event when a provider is created so its orders roll up to the right edition.
  eventId: text("event_id").notNull().default(""),
  // The ticketing company: eventbrite · axs · ticketmaster · dice · universe ·
  // seetickets · generic. `generic` is the normalized contract any company (or a
  // relay) can post to; the named ones just document intent and tag the source.
  provider: text("provider").notNull().default("generic"),
  displayName: text("display_name").notNull().default(""),
  // The provider's own id for this event, when they have one — recorded for
  // reconciliation and for building the daily-analytics request in the docs.
  externalEventId: text("external_event_id").notNull().default(""),
  // active · disabled — a disabled provider's token stops accepting deliveries.
  status: text("status").notNull().default("active"),
  // Only the SHA-256 hash of the ingest token is stored, so a database read can
  // never recover a live token; the plaintext is shown exactly once, at
  // create/rotate time. `ingestTokenHint` is the last four characters, kept for
  // display so an admin can tell two integrations apart without revealing either.
  ingestTokenHash: text("ingest_token_hash").notNull().default(""),
  ingestTokenHint: text("ingest_token_hint").notNull().default(""),
  // Rolling delivery health so the admin can see an integration is live: when it
  // last received anything and how many orders it has ingested in total.
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  ordersIngested: integer("orders_ingested").notNull().default(0),
  settings: jsonb("settings").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("ticket_providers_token_hash_idx").on(t.ingestTokenHash),
  index("ticket_providers_event_idx").on(t.eventId),
]);

// One canonical ticket order. `dedup_key` (provider + ':' + externalOrderId, or
// the row id when the source gives no order id) is unique so ingestion is
// idempotent — a retried webhook or a re-sent daily digest upserts the same row
// rather than inflating the count. `status` drives whether the order's money and
// quantity count toward realized revenue (completed) or are backed out
// (refunded/canceled). `raw` keeps the provider's original payload for audit and
// for surfacing fields the normalized columns don't model.
export const ticketOrders = pgTable("ticket_orders", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull().default(""),
  providerId: text("provider_id").notNull().default(""),
  provider: text("provider").notNull().default("generic"),
  externalOrderId: text("external_order_id").notNull().default(""),
  // Idempotency key. Unique, so the same source order can never produce two rows.
  dedupKey: text("dedup_key").notNull().default(""),
  buyerName: text("buyer_name").notNull().default(""),
  buyerEmail: text("buyer_email").notNull().default(""),
  // completed · pending · refunded · canceled
  status: text("status").notNull().default("completed"),
  // The ticket type/tier (e.g. "General Admission", "VIP"). One order is counted
  // under one tier; multi-tier orders can be split by the sender or left as-is.
  tierName: text("tier_name").notNull().default(""),
  quantity: integer("quantity").notNull().default(0),
  // Integer cents. gross = what the buyer paid; fees = the ticketing company's
  // cut; net = what reaches the organizer (gross − fees when not supplied).
  grossCents: integer("gross_cents").notNull().default(0),
  feesCents: integer("fees_cents").notNull().default(0),
  netCents: integer("net_cents").notNull().default(0),
  currency: text("currency").notNull().default("USD"),
  purchasedAt: timestamp("purchased_at", { withTimezone: true }),
  raw: jsonb("raw").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("ticket_orders_dedup_idx").on(t.dedupKey),
  index("ticket_orders_event_idx").on(t.eventId),
  index("ticket_orders_provider_idx").on(t.providerId),
  index("ticket_orders_purchased_idx").on(t.purchasedAt),
  index("ticket_orders_status_idx").on(t.status),
]);

// A billing document for a campaign. `number` is a human-facing invoice number
// (unique). Money is integer cents. `status` tracks the lifecycle
// (draft · sent · paid · void) and `lineItems` is a small JSON breakdown so the
// invoice is self-contained even if the campaign later changes.
export const adInvoices = pgTable("ad_invoices", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id").notNull().default(""),
  companyId: text("company_id").notNull().default(""),
  number: text("number").notNull().default(""),
  amountCents: integer("amount_cents").notNull().default(0),
  currency: text("currency").notNull().default("USD"),
  status: text("status").notNull().default("draft"),
  issuedAt: timestamp("issued_at", { withTimezone: true }),
  dueAt: timestamp("due_at", { withTimezone: true }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  lineItems: jsonb("line_items").notNull().default([]),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("ad_invoices_number_idx").on(t.number),
  index("ad_invoices_campaign_idx").on(t.campaignId),
  index("ad_invoices_company_idx").on(t.companyId),
  index("ad_invoices_status_idx").on(t.status),
]);
