// platform/auth/access-control-contract.mjs - reusable auth and access contract.
//
// Beslyfe identity must come from server-side session state, not caller-supplied
// ids, roles, or admin names. This contract names the reusable authentication,
// authorization, and mutation-safety rules every ecosystem should inherit.

export const AUTH_RECORD_TYPES = [
  {
    key: 'account',
    label: 'Account',
    table: 'accounts',
    purpose: 'Stores the login identity, role, status, credential hash, and linked profile reference.',
  },
  {
    key: 'session',
    label: 'Session',
    table: 'sessions',
    purpose: 'Stores opaque, server-side login sessions bound to account, profile, role, and expiry.',
  },
  {
    key: 'password-reset',
    label: 'Password Reset',
    table: 'password_resets',
    purpose: 'Stores single-use hashed reset tokens with expiry and used-at lifecycle.',
  },
  {
    key: 'email-verification',
    label: 'Email Verification',
    table: 'email_verifications',
    purpose: 'Stores single-use hashed verification tokens for self-service account activation.',
  },
  {
    key: 'auth-attempt',
    label: 'Auth Attempt',
    table: 'auth_attempts',
    purpose: 'Tracks throttling buckets for login, signup, password reset, and public access lookups.',
  },
]

export const AUTH_REQUIRED_FIELDS = [
  'id',
  'accountId',
  'profileId',
  'role',
  'status',
  'credentialHash',
  'sessionToken',
  'expiresAt',
  'createdAt',
]

export const AUTH_ROLE_TYPES = [
  'admin',
  'vendor',
  'sponsor',
  'speaker',
  'dj',
  'attendee',
  'other',
]

export const AUTH_STATUS_STATES = [
  'pending',
  'approved',
  'rejected',
  'suspended',
  'disabled',
]

export const AUTH_SESSION_CONTROLS = [
  'opaque server-stored session token',
  'httpOnly cookie',
  'Secure cookie',
  'SameSite=Strict cookie',
  'sliding renewal for active sessions',
  'expired sessions are swept lazily',
  'logout deletes the server session row',
]

export const AUTH_MUTATION_CONTROLS = [
  'state-changing browser requests require same-origin checks',
  'admin authority is revalidated against the live account',
  'client-supplied actor identity is ignored',
  'privileged mutations write audit records',
  'request bodies must parse as JSON objects',
  'rate limits fail open only for availability',
]

export const AUTH_PASSWORD_CONTROLS = [
  'member passwords require at least 8 characters',
  'admin-capable passwords require at least 12 characters',
  'admin-capable passwords require at least three character classes',
  'password hashes compare in constant time',
  'raw passwords are never stored',
  'reset and verification tokens are stored hashed',
]

export const AUTH_TRUST_CONTROLS = [
  'identity is derived from session rows only',
  'admin sessions lose authority when account role or status changes',
  'session cookies are not readable by browser JavaScript',
  'cross-site writes are blocked in depth',
  'auth logs never include raw secrets',
  'temporary database read failure does not lock out valid admins',
  'profile provisioning is best-effort and durable when possible',
]

export function authRecordTypeKeys() {
  return AUTH_RECORD_TYPES.map((type) => type.key)
}

export function authAccessControlContractSummary() {
  return {
    recordTypes: AUTH_RECORD_TYPES.map((type) => ({
      key: type.key,
      label: type.label,
      table: type.table,
      purpose: type.purpose,
    })),
    requiredFields: [...AUTH_REQUIRED_FIELDS],
    roleTypes: [...AUTH_ROLE_TYPES],
    statusStates: [...AUTH_STATUS_STATES],
    sessionControls: [...AUTH_SESSION_CONTROLS],
    mutationControls: [...AUTH_MUTATION_CONTROLS],
    passwordControls: [...AUTH_PASSWORD_CONTROLS],
    trustControls: [...AUTH_TRUST_CONTROLS],
  }
}
