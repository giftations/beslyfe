(() => {
  if (window.__beslyfeTrafficSent) return
  window.__beslyfeTrafficSent = true
  if (navigator.doNotTrack === '1') return
  const params = new URLSearchParams(location.search)
  const attribution = {
    source: params.get('utm_source') || '',
    medium: params.get('utm_medium') || '',
    campaign: params.get('utm_campaign') || '',
  }
  // Keep privacy-safe first-touch campaign tags for this browser session so a
  // visitor who lands on the homepage and then opens /signup is still credited
  // to the campaign that brought them here. No email, name, form value, or
  // cross-session identifier is stored.
  if (attribution.source || attribution.medium || attribution.campaign) {
    try { sessionStorage.setItem('beslyfe_campaign_attribution', JSON.stringify(attribution)) } catch (e) {}
  }
  const payload = JSON.stringify({
    path: location.pathname,
    source: attribution.source,
    medium: attribution.medium,
    campaign: attribution.campaign,
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

