import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  ADMIN_MUTATION_POLICIES,
  ADMIN_NAVIGATION_CONTROLS,
  ADMIN_REQUIRED_FIELDS,
  ADMIN_SYSTEM_SURFACES,
  ADMIN_TRUST_CONTROLS,
  ADMIN_WORKSPACE_TYPES,
  adminOsContractSummary,
  adminWorkspaceTypeKeys,
} from '../platform/admin/os-contract.mjs'

test('Admin OS workspace type keys are unique and stable-looking', () => {
  const keys = adminWorkspaceTypeKeys()
  assert.equal(new Set(keys).size, keys.length)
  for (const key of keys) assert.match(key, /^[a-z][a-z0-9-]*$/)
})

test('Admin OS contract covers reusable operator workspace groups', () => {
  for (const key of ['overview', 'content', 'participation', 'relationships', 'community', 'operations']) {
    assert.ok(ADMIN_WORKSPACE_TYPES.some((type) => type.key === key))
  }
})

test('Admin OS contract requires module, route, policy, and audit metadata', () => {
  for (const field of ['workspaceId', 'moduleKey', 'route', 'mutationPolicy', 'auditActions']) {
    assert.ok(ADMIN_REQUIRED_FIELDS.includes(field))
  }
})

test('Admin OS mutations preserve same-origin, audit, and identity boundaries', () => {
  assert.ok(ADMIN_MUTATION_POLICIES.includes('same-origin-required'))
  assert.ok(ADMIN_MUTATION_POLICIES.includes('audit-log-required'))
  assert.ok(ADMIN_MUTATION_POLICIES.includes('never-trust-client-identity'))
})

test('Admin OS navigation and system surfaces stay platform-owned', () => {
  assert.ok(ADMIN_NAVIGATION_CONTROLS.includes('single shell route'))
  assert.ok(ADMIN_NAVIGATION_CONTROLS.includes('unknown routes fall back to dashboard'))
  assert.ok(ADMIN_SYSTEM_SURFACES.includes('platform contract registry'))
  assert.ok(ADMIN_SYSTEM_SURFACES.includes('audit log'))
})

test('Admin OS trust controls prevent duplicated apps and private-data exposure', () => {
  assert.ok(ADMIN_TRUST_CONTROLS.includes('private member messages are not exposed to operators by default'))
  assert.ok(ADMIN_TRUST_CONTROLS.includes('no second admin app for a module'))
  assert.ok(ADMIN_TRUST_CONTROLS.includes('secrets never render in the browser'))
})

test('Admin OS contract summary is serializable and complete', () => {
  const summary = adminOsContractSummary()
  assert.equal(summary.workspaceTypes.length, ADMIN_WORKSPACE_TYPES.length)
  assert.equal(summary.requiredFields.length, ADMIN_REQUIRED_FIELDS.length)
  assert.doesNotThrow(() => JSON.stringify(summary))
})
