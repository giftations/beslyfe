const USERNAME_PROVIDER_RULES = Object.freeze({
  paypal: {
    pattern: /^[A-Za-z0-9]{1,20}$/,
    destination(handle) { return `https://paypal.me/${encodeURIComponent(handle)}` },
    extract(url) {
      if (!['paypal.me', 'www.paypal.me'].includes(url.hostname.toLowerCase())) return ''
      const match = url.pathname.match(/^\/([^/]+)\/?$/)
      return match ? decodeURIComponent(match[1]) : ''
    },
  },
  'cash-app': {
    pattern: /^[A-Za-z][A-Za-z0-9]{0,19}$/,
    destination(handle) { return `https://cash.app/$${encodeURIComponent(handle)}` },
    extract(url) {
      if (url.hostname.toLowerCase() !== 'cash.app') return ''
      const match = url.pathname.match(/^\/\$+([^/]+)\/?$/)
      return match ? decodeURIComponent(match[1]) : ''
    },
  },
  venmo: {
    pattern: /^[A-Za-z0-9_-]{5,30}$/,
    destination(handle) { return `https://venmo.com/u/${encodeURIComponent(handle)}` },
    extract(url) {
      if (!['venmo.com', 'www.venmo.com'].includes(url.hostname.toLowerCase())) return ''
      const match = url.pathname.match(/^\/u\/([^/]+)\/?$/)
      return match ? decodeURIComponent(match[1]) : ''
    },
  },
})

function compact(value) {
  return String(value == null ? '' : value).trim().replace(/\s+/g, '')
}

function extractHandleFromUrl(providerKey, value) {
  if (!/^https?:\/\//i.test(value)) return value
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password) return ''
    return USERNAME_PROVIDER_RULES[providerKey]?.extract(url) || ''
  } catch {
    return ''
  }
}

export function paymentInputKind(providerKey) {
  if (providerKey === 'contact-form') return 'built-in'
  return USERNAME_PROVIDER_RULES[providerKey] ? 'handle' : 'url'
}

export function normalizePaymentHandle(providerKey, value) {
  const rule = USERNAME_PROVIDER_RULES[providerKey]
  if (!rule) return ''
  let handle = extractHandleFromUrl(providerKey, compact(value))
  if (!handle) return ''
  handle = handle.replace(/^[@$]+/, '')
  return rule.pattern.test(handle) ? handle : ''
}

export function paymentDestinationFromHandle(providerKey, value) {
  const handle = normalizePaymentHandle(providerKey, value)
  const rule = USERNAME_PROVIDER_RULES[providerKey]
  return handle && rule ? rule.destination(handle) : ''
}

export function securePaymentDestination(value) {
  const raw = compact(value)
  if (!/^https:\/\//i.test(raw)) return ''
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' || url.username || url.password) return ''
    return url.toString()
  } catch {
    return ''
  }
}

export function preparePaymentDestination(providerKey, value) {
  const kind = paymentInputKind(providerKey)
  if (kind === 'built-in') {
    return { kind, valid: true, canonicalHandle: '', destinationUrl: '' }
  }
  if (kind === 'handle') {
    const canonicalHandle = normalizePaymentHandle(providerKey, value)
    return {
      kind,
      valid: Boolean(canonicalHandle),
      canonicalHandle,
      destinationUrl: canonicalHandle ? paymentDestinationFromHandle(providerKey, canonicalHandle) : '',
    }
  }
  const destinationUrl = securePaymentDestination(value)
  return { kind, valid: Boolean(destinationUrl), canonicalHandle: '', destinationUrl }
}
