import { test } from 'node:test'
import assert from 'node:assert/strict'

const EMAIL_MODULE = '../netlify/functions/lib/email.mjs'

async function importEmailHelper(name) {
  return import(`${EMAIL_MODULE}?case=${name}-${Date.now()}-${Math.random()}`)
}

function snapshotEnv() {
  return {
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    SENDGRID_API_KEY: process.env.SENDGRID_API_KEY,
    SENDGRID_FROM: process.env.SENDGRID_FROM,
    EMAIL_FROM_ADDRESS: process.env.EMAIL_FROM_ADDRESS,
    APPROVAL_EMAIL_FROM: process.env.APPROVAL_EMAIL_FROM,
  }
}

function restoreEnv(snapshot) {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

test('sendEmail prefers Resend over legacy SendGrid when both are configured', async () => {
  const env = snapshotEnv()
  const originalFetch = globalThis.fetch
  const calls = []
  try {
    process.env.RESEND_API_KEY = 'resend-test-token'
    process.env.SENDGRID_API_KEY = 'sendgrid-test-token'
    process.env.EMAIL_FROM_ADDRESS = 'sender@example.com'
    delete process.env.APPROVAL_EMAIL_FROM
    globalThis.fetch = async (url, options) => {
      calls.push({ url: String(url), options })
      return { ok: true, status: 202 }
    }

    const { sendEmail } = await importEmailHelper('resend-primary')
    const result = await sendEmail({ to: 'person@example.com', subject: 'Test', text: 'Hello' })

    assert.equal(result.sent, true)
    assert.equal(result.provider, 'resend')
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, 'https://api.resend.com/emails')
    assert.equal(calls[0].options.headers.Authorization, 'Bearer resend-test-token')
  } finally {
    globalThis.fetch = originalFetch
    restoreEnv(env)
  }
})

test('sendEmail keeps SendGrid as legacy fallback when Resend is not configured', async () => {
  const env = snapshotEnv()
  const originalFetch = globalThis.fetch
  const calls = []
  try {
    delete process.env.RESEND_API_KEY
    process.env.SENDGRID_API_KEY = 'sendgrid-test-token'
    process.env.SENDGRID_FROM = 'Legacy Sender <sender@example.com>'
    globalThis.fetch = async (url, options) => {
      calls.push({ url: String(url), options })
      return { ok: true, status: 202 }
    }

    const { sendEmail } = await importEmailHelper('sendgrid-fallback')
    const result = await sendEmail({ to: 'person@example.com', subject: 'Test', text: 'Hello' })

    assert.equal(result.sent, true)
    assert.equal(result.provider, 'sendgrid')
    assert.equal(calls.length, 1)
    assert.equal(calls[0].url, 'https://api.sendgrid.com/v3/mail/send')
    assert.equal(calls[0].options.headers.Authorization, 'Bearer sendgrid-test-token')
  } finally {
    globalThis.fetch = originalFetch
    restoreEnv(env)
  }
})

test('sendEmail missing provider warning does not include secret values', async () => {
  const env = snapshotEnv()
  const originalWarn = console.warn
  const warnings = []
  try {
    delete process.env.RESEND_API_KEY
    delete process.env.SENDGRID_API_KEY
    delete process.env.SENDGRID_FROM
    delete process.env.EMAIL_FROM_ADDRESS
    delete process.env.APPROVAL_EMAIL_FROM
    console.warn = (message) => warnings.push(String(message))

    const { sendEmail } = await importEmailHelper('missing-provider')
    const result = await sendEmail({ to: 'person@example.com', subject: 'Test', text: 'Hello' })

    assert.equal(result.sent, false)
    assert.equal(result.reason, 'no-provider')
    assert.equal(warnings.length, 1)
    assert.match(warnings[0], /RESEND_API_KEY/)
    assert.doesNotMatch(warnings[0], /person@example\.com/)
    assert.doesNotMatch(warnings[0], /Hello/)
  } finally {
    console.warn = originalWarn
    restoreEnv(env)
  }
})
