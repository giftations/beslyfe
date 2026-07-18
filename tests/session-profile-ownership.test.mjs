import { test } from 'node:test'
import assert from 'node:assert/strict'

import { readSession, ensureProfileForAccount } from '../netlify/functions/lib/session.mjs'

function fakeDb({ sessionProfileId = 'victim_profile', accountProfileId = 'owner_profile', profileExists = true } = {}) {
  const updates = []
  const db = {
    updates,
    async sql(strings, ...values) {
      const query = strings.join('?')
      if (query.includes('FROM sessions')) {
        return [{
          token: values[0],
          account_id: 'acct_owner',
          profile_id: sessionProfileId,
          role: 'attendee',
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        }]
      }
      if (query.includes('FROM accounts')) {
        return [{
          id: 'acct_owner',
          name: 'Owner',
          email: 'owner@example.com',
          role: 'attendee',
          profile_id: accountProfileId,
        }]
      }
      if (query.includes('FROM profiles')) {
        return profileExists ? [{ id: values[0] }] : []
      }
      if (query.includes('UPDATE sessions SET "profile_id"')) {
        updates.push({ profileId: values[0], target: values[1] })
        return []
      }
      return []
    },
  }
  return db
}

function sessionRequest(token = 'tok_session') {
  return new Request('https://beslyfe.example/.netlify/functions/auth?action=session', {
    headers: { cookie: `beslyfe_sid=${encodeURIComponent(token)}` },
  })
}

test('readSession migrates the pre-platform cookie without invalidating the session', async () => {
  const db = fakeDb({ sessionProfileId: 'owner_profile', accountProfileId: 'owner_profile' })
  const earlierName = ['ba', 'kd_sid'].join('')
  const request = new Request('https://beslyfe.example/.netlify/functions/auth?action=session', {
    headers: { cookie: `${earlierName}=tok_session` },
  })
  const session = await readSession(request, db)
  assert.equal(session.accountId, 'acct_owner')
  assert.match(session.renewedCookie, /^beslyfe_sid=tok_session;/)
})

test('readSession heals a stale session profile to the account-owned profile', async () => {
  const db = fakeDb({ sessionProfileId: 'victim_profile', accountProfileId: 'owner_profile' })
  const session = await readSession(sessionRequest(), db)

  assert.equal(session.accountId, 'acct_owner')
  assert.equal(session.profileId, 'owner_profile')
  assert.deepEqual(db.updates, [{ profileId: 'owner_profile', target: 'tok_session' }])
})

test('readSession keeps an already-owned session profile unchanged', async () => {
  const db = fakeDb({ sessionProfileId: 'owner_profile', accountProfileId: 'owner_profile' })
  const session = await readSession(sessionRequest(), db)

  assert.equal(session.profileId, 'owner_profile')
  assert.deepEqual(db.updates, [])
})

test('ensureProfileForAccount adopts the account-owned profile instead of a stale session profile', async () => {
  const db = fakeDb({ sessionProfileId: 'victim_profile', accountProfileId: 'owner_profile' })
  const session = { token: 'tok_session', accountId: 'acct_owner', profileId: 'victim_profile', role: 'attendee' }

  const profileId = await ensureProfileForAccount(db, session)

  assert.equal(profileId, 'owner_profile')
  assert.equal(session.profileId, 'owner_profile')
  assert.deepEqual(db.updates, [{ profileId: 'owner_profile', target: 'acct_owner' }])
})
