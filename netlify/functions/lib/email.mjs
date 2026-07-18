// Outbound transactional email. Resend is the primary production provider
// (RESEND_API_KEY plus EMAIL_FROM_ADDRESS / APPROVAL_EMAIL_FROM). SendGrid is
// kept only as an optional legacy fallback when an older environment already has
// SENDGRID_API_KEY configured. When no provider is configured the call is a no-op
// that returns { sent: false } — it never throws, so a missing key degrades to
// "not delivered" rather than failing the request that triggered it.

const env = (key) => (typeof process !== 'undefined' && process.env ? process.env[key] : '') || ''
const warned = new Set()

function warnOnce(code, message) {
  if (warned.has(code)) return
  warned.add(code)
  console.warn(message)
}

// The verified "from" address that outbound mail is sent as. This matters more
// than the API key for deliverability: Resend/SendGrid will only deliver to
// arbitrary recipients when the sender is on a verified domain. The old
// `onboarding@resend.dev` sandbox sender could only reach the provider account's
// own inbox, so verification, password-reset and approval mail addressed to real
// users was silently dropped — which is why those emails never arrived.
// admin@cannadispo.com is the current operational fallback sender. Keep it until
// EMAIL_FROM_ADDRESS / APPROVAL_EMAIL_FROM are verified and configured in Netlify.
export const VERIFIED_SENDER = env('EMAIL_FROM_ADDRESS') || 'admin@cannadispo.com'
export const DEFAULT_FROM = `Beslyfe <${VERIFIED_SENDER}>`

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

  const resendKey = env('RESEND_API_KEY')
  if (resendKey) {
    const sender = from || env('APPROVAL_EMAIL_FROM') || DEFAULT_FROM
    if (!parseAddress(sender).email) {
      warnOnce('email-no-sender', '[email] Email delivery skipped: configure EMAIL_FROM_ADDRESS or APPROVAL_EMAIL_FROM. Secret values were not logged.')
      return { sent: false, reason: 'no-sender' }
    }
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: sender, to: recipients, subject: subject || '', text, html }),
      })
      if (!res.ok) {
        warnOnce(`email-resend-status-${res.status}`, `[email] Resend delivery failed with HTTP ${res.status}. Secret values were not logged.`)
      }
      return { sent: res.ok, provider: 'resend', status: res.status }
    } catch {
      warnOnce('email-resend-error', '[email] Resend delivery failed before receiving a response. Secret values were not logged.')
      return { sent: false, reason: 'resend-error' }
    }
  }

  const sendgridKey = env('SENDGRID_API_KEY')
  if (sendgridKey) {
    const sender = parseAddress(from || env('SENDGRID_FROM') || env('APPROVAL_EMAIL_FROM') || DEFAULT_FROM)
    if (!sender.email) {
      warnOnce('email-no-legacy-sender', '[email] Legacy SendGrid delivery skipped: configure SENDGRID_FROM, APPROVAL_EMAIL_FROM, or EMAIL_FROM_ADDRESS. Secret values were not logged.')
      return { sent: false, reason: 'no-sender' }
    }
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
      if (!res.ok) {
        warnOnce(`email-sendgrid-status-${res.status}`, `[email] Legacy SendGrid delivery failed with HTTP ${res.status}. Secret values were not logged.`)
      }
      return { sent: res.ok, provider: 'sendgrid', status: res.status }
    } catch {
      warnOnce('email-sendgrid-error', '[email] Legacy SendGrid delivery failed before receiving a response. Secret values were not logged.')
      return { sent: false, reason: 'sendgrid-error' }
    }
  }

  warnOnce('email-no-provider', '[email] Email delivery skipped: configure RESEND_API_KEY. SENDGRID_API_KEY remains optional legacy fallback. Secret values were not logged.')
  return { sent: false, reason: 'no-provider' }
}
