import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { normalizeSignupAttribution } from '../netlify/functions/auth.mjs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('admin cleanup is restricted to pending unverified non-admin accounts', () => {
  const auth = read('netlify/functions/auth.mjs')
  assert.match(auth, /action === 'delete-unverified-account'/)
  assert.match(auth, /account\.role === 'admin' \|\| account\.email_verified \|\| account\.status !== 'pending'/)
  assert.match(auth, /"email_verified" = false AND "status" = 'pending' AND "role" <> 'admin'/)
  assert.match(auth, /auth\.unverified_account_delete/)
})

test('admin UI exposes verification state and guarded deletion', () => {
  const admin = read('assets/js/admin-os.js')
  assert.match(admin, /Email not verified/)
  assert.match(admin, /data-delete-unverified/)
  assert.match(admin, /delete-unverified-account/)
})

test('members can resend immediately after signup or from the sign-in page', () => {
  const authUi = read('auth.js')
  const login = read('admin-login.html')
  assert.match(authUi, /offerResend\(email, successEl\)/)
  assert.match(login, /Resend verification email/)
})

test('signup attribution is privacy-safe and visible only to admin analytics', () => {
  assert.deepEqual(normalizeSignupAttribution({ source: 'Instagram Story', medium: 'Organic', campaign: 'Daily Growth / Morning', email: 'ignored@example.com' }), {
    source: 'instagram_story', medium: 'organic', campaign: 'daily_growth_morning',
  })
  const traffic = read('assets/js/traffic.js')
  const authUi = read('auth.js')
  const admin = read('assets/js/admin-os.js')
  assert.match(traffic, /beslyfe_campaign_attribution/)
  assert.match(authUi, /attribution: signupAttribution\(\)/)
  assert.match(admin, /Signups by campaign/)
  assert.match(admin, /These totals never appear in public campaign content/)
})
