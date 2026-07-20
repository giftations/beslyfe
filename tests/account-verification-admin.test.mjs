import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

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
