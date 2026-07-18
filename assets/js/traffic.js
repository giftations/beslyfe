(() => {
  if (window.__beslyfeTrafficSent) return
  window.__beslyfeTrafficSent = true
  if (navigator.doNotTrack === '1') return
  const params = new URLSearchParams(location.search)
  const payload = JSON.stringify({
    path: location.pathname,
    source: params.get('utm_source') || '',
    medium: params.get('utm_medium') || '',
    campaign: params.get('utm_campaign') || '',
    referrer: document.referrer || '',
  })
  const endpoint = '/.netlify/functions/traffic'
  if (navigator.sendBeacon) {
    navigator.sendBeacon(endpoint, new Blob([payload], { type: 'application/json' }))
    return
  }
  fetch(endpoint, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: true,
  }).catch(() => {})
})()

