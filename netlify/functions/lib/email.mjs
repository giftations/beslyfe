// Outbound transactional email, sent through whichever provider the site
// actually has configured. This project's environment provides SendGrid
// (SENDGRID_API_KEY / SENDGRID_FROM), so that is preferred; a Resend key
// (RESEND_API_KEY / APPROVAL_EMAIL_FROM) is used as a fallback when that is what
// an environment supplies instead. When no provider is configured the call is a
// no-op that returns { sent: false } — it never throws, so a missing key
// degrades to "not delivered" rather than failing the request that triggered it.

const env = (key) => (typeof process !== 'undefined' && process.env ? process.env[key] : '') || ''

// The verified "from" address that outbound mail is sent as. This matters more
// than the API key for deliverability: Resend/SendGrid will only deliver to
// arbitrary recipients when the sender is on a verified domain. The old
// `onboarding@resend.dev` sandbox sender could only reach the provider account's
// own inbox, so verification, password-reset and approval mail addressed to real
// users was silently dropped — which is why those emails never arrived.
// admin@cannadispo.com is a verified mailbox, so it is the default sender
// everywhere unless an env var (APPROVAL_EMAIL_FROM / SENDGRID_FROM) overrides it.
export const VERIFIED_SENDER = env('EMAIL_FROM_ADDRESS') || 'admin@cannadispo.com'
export const DEFAULT_FROM = `Bak'd On The Bay <${VERIFIED_SENDER}>`

// Parse a `Display Name <addr@example.com>` or bare `addr@example.com` string
// into the { name, email } shape SendGrid wants (Resend accepts the raw string).
function parseAddress(value) {
  const raw = String(value || '').trim()
  const m = raw.match(/^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/)
  if (m) return { name: m[1].replace(/(^"|"$)/g, '').trim(), email: m[2].trim() }
  return { name: '', email: raw }
}

// Send one email. `to` may be a single address or an array. Returns a result
// object; callers treat a falsy `sent` as "delivery not attempted/failed".
export async function sendEmail({ to, subject, text, html, from } = {}) {
  const recipients = (Array.isArray(to) ? to : [to]).map((t) => String(t || '').trim()).filter(Boolean)
  if (!recipients.length) return { sent: false, reason: 'no-recipient' }

  const sendgridKey = env('SENDGRID_API_KEY')
  if (sendgridKey) {
    const sender = parseAddress(from || env('SENDGRID_FROM') || env('APPROVAL_EMAIL_FROM') || DEFAULT_FROM)
    if (!sender.email) return { sent: false, reason: 'no-sender' }
    const content = []
    if (text) content.push({ type: 'text/plain', value: text })
    if (html) content.push({ type: 'text/html', value: html })
    if (!content.length) content.push({ type: 'text/plain', value: '' })
    try {
      const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${sendgridKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personalizations: [{ to: recipients.map((email) => ({ email })) }],
          from: sender.name ? { email: sender.email, name: sender.name } : { email: sender.email },
          subject: subject || '',
          content,
        }),
      })
      return { sent: res.ok, provider: 'sendgrid', status: res.status }
    } catch {
      return { sent: false, reason: 'sendgrid-error' }
    }
  }

  const resendKey = env('RESEND_API_KEY')
  if (resendKey) {
    const sender = from || env('APPROVAL_EMAIL_FROM') || DEFAULT_FROM
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: sender, to: recipients, subject: subject || '', text, html }),
      })
      return { sent: res.ok, provider: 'resend', status: res.status }
    } catch {
      return { sent: false, reason: 'resend-error' }
    }
  }

  return { sent: false, reason: 'no-provider' }
}
