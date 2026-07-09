import test from 'node:test'
import assert from 'node:assert/strict'

import {
  normalizePipelineStage,
  normalizeCrmTags,
  normalizeCrmPatch,
  normalizeCrmActivityInput,
  crmMutationOriginError,
} from '../netlify/functions/crm.mjs'

test('CRM pipeline stage normalization keeps known stages and falls back safely', () => {
  assert.equal(normalizePipelineStage('paid'), 'paid')
  assert.equal(normalizePipelineStage('unknown-stage'), 'new')
  assert.equal(normalizePipelineStage(''), 'new')
})

test('CRM tag normalization accepts arrays and comma strings with stable dedupe', () => {
  assert.deepEqual(normalizeCrmTags(['Sponsor', 'VIP Lead', 'Sponsor']), ['sponsor', 'vip_lead'])
  assert.deepEqual(normalizeCrmTags('Vendor, Hot Lead, Vendor!!!'), ['vendor', 'hot_lead'])
})

test('CRM patch normalization validates business fields', () => {
  const patch = normalizeCrmPatch({
    status: 'won',
    tags: 'Sponsor, Hot',
    leadSource: 'sponsor_application',
    pipelineStage: 'payment_pending',
    ownerAccountId: 'acct_123',
    followUpAt: '2026-08-01T12:30:00.000Z',
    lifetimeValueCents: 125000,
    priority: 'urgent',
  })
  assert.equal(patch.status, 'won')
  assert.deepEqual(patch.tags, ['sponsor', 'hot'])
  assert.equal(patch.lead_source, 'sponsor_application')
  assert.equal(patch.pipeline_stage, 'payment_pending')
  assert.equal(patch.owner_account_id, 'acct_123')
  assert.equal(patch.follow_up_at, '2026-08-01T12:30:00.000Z')
  assert.equal(patch.lifetime_value_cents, 125000)
  assert.equal(patch.priority, 'urgent')
})

test('CRM activity input rejects invalid subjects and normalizes known kinds', () => {
  assert.equal(normalizeCrmActivityInput({ subjectType: 'profile', subjectId: 'x' }).error, 'Unknown activity subject.')
  assert.equal(normalizeCrmActivityInput({ subjectType: 'person' }).error, 'Missing activity subject id.')

  const normalized = normalizeCrmActivityInput({
    subjectType: 'company',
    subjectId: 'cmp_1',
    kind: 'meeting',
    title: 'Sponsor call',
  })
  assert.equal(normalized.error, undefined)
  assert.equal(normalized.value.subjectType, 'company')
  assert.equal(normalized.value.kind, 'meeting')
  assert.equal(normalized.value.title, 'Sponsor call')
})

test('CRM mutation same-origin guard remains enforced', async () => {
  const blocked = crmMutationOriginError(new Request('https://bak.example/.netlify/functions/crm', {
    method: 'POST',
    headers: { Origin: 'https://evil.example' },
  }))
  assert.equal(blocked.status, 403)
  assert.equal(crmMutationOriginError(new Request('https://bak.example/.netlify/functions/crm', {
    method: 'POST',
    headers: { Origin: 'https://bak.example' },
  })), null)
})
