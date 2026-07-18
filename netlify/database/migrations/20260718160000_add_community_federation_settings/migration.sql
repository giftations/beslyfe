UPDATE "ecosystems"
SET "settings" = COALESCE("settings", '{}'::jsonb) || '{
  "communityBridge": {
    "enabled": true,
    "protocolVersion": "beslyfe-community/1",
    "networkId": "beslyfe-network",
    "ecosystemId": "beslyfe-network",
    "identityMode": "one-profile-many-memberships",
    "contributionMode": "public-opt-in",
    "originAttribution": true,
    "audience": {"minimumAge": 0, "contentRating": "general"},
    "privateDataExport": false,
    "accountLinkRequiredForWrites": true
  }
}'::jsonb,
"updated_at" = now()
WHERE "id" = 'beslyfe-network';--> statement-breakpoint

UPDATE "ecosystems"
SET "settings" = COALESCE("settings", '{}'::jsonb) || '{
  "proof": true,
  "canonicalUrl": "https://cannadispo.com/community",
  "communityBridge": {
    "enabled": true,
    "protocolVersion": "beslyfe-community/1",
    "networkId": "beslyfe-network",
    "ecosystemId": "cannadispo",
    "identityMode": "federated",
    "contributionMode": "public-opt-in",
    "originAttribution": true,
    "audience": {"minimumAge": 18, "contentRating": "adult-cannabis"},
    "privateDataExport": false,
    "accountLinkRequiredForWrites": true
  }
}'::jsonb,
"updated_at" = now()
WHERE "id" = 'proof-bakd-on-the-bay';
