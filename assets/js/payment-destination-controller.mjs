import {
  paymentInputKind,
  preparePaymentDestination,
} from '../../platform/growth/payment-destination.mjs'

const endpoint = '/.netlify/functions/ecosystems'
const actionLabels = {
  product: 'Buy now',
  service: 'Get started',
  booking: 'Book now',
  lead: 'Request details',
  donation: 'Support this work',
  ticket: 'Get tickets',
}
const capabilityLabels = {
  identity: 'Identity',
  cms: 'Website & content',
  analytics: 'Analytics',
  'community-bridge': 'Community bridge',
  commerce: 'Online sales',
  crm: 'Customer relationships',
  directory: 'People directory',
  community: 'Feed, reels & stories',
  messaging: 'Messages & groups',
  scheduling: 'Bookings & schedule',
  applications: 'Applications',
  advertising: 'Advertising',
  operations: 'Operations workspace',
  inventory: 'Products & inventory',
  property: 'Property management',
  automation: 'Workflow automation',
  ai: 'AI assistance',
  ticketing: 'Ticketing',
  floorplan: 'Floor plan',
}

function ready(callback) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', callback, { once: true })
  else callback()
}

ready(() => {
  const form = document.getElementById('buildForm')
  const launchButton = document.getElementById('launchButton')
  const modeSelect = document.getElementById('salesMode')
  const providerSelect = document.getElementById('salesProvider')
  const field = document.getElementById('salesDestinationField')
  const input = document.getElementById('salesDestination')
  const label = document.getElementById('salesDestinationLabel')
  const help = document.getElementById('salesDestinationHelp')
  const preview = document.getElementById('paymentUrlPreview')
  const note = document.getElementById('paymentProviderNote')
  const resultHost = document.getElementById('builderResult')
  if (!form || !launchButton || !modeSelect || !providerSelect || !field || !input) return

  launchButton.type = 'button'
  let submitting = false
  let createdPlan = null
  let lastProvider = ''

  const salesConnect = document.getElementById('salesConnect')
  const salesHeading = salesConnect?.querySelector('h3')
  const salesIntro = salesConnect?.querySelector('h3 + p')
  const salesPill = salesConnect?.querySelector('.status-pill')
  const providerLabel = document.querySelector('label[for="salesProvider"]')
  if (salesHeading) salesHeading.textContent = 'Connect the first customer action.'
  if (salesIntro) salesIntro.textContent = 'Choose an internal lead form, a username-based payment service, or a secure provider link. Beslyfe previews the destination before publishing.'
  if (salesPill) salesPill.textContent = 'First growth action'
  if (providerLabel) providerLabel.textContent = 'Action destination'

  function fieldValue(id) {
    return String(document.getElementById(id)?.value || '').trim()
  }

  function checkedValues(name) {
    return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map((element) => element.value)
  }

  function selectedValue(name) {
    return document.querySelector(`input[name="${name}"]:checked`)?.value || ''
  }

  function clearError() {
    document.querySelectorAll('.builder-error').forEach((element) => element.remove())
    input.setCustomValidity('')
  }

  function showError(message) {
    clearError()
    const paragraph = document.createElement('p')
    paragraph.className = 'builder-error'
    paragraph.setAttribute('role', 'alert')
    paragraph.textContent = message
    document.querySelector('.builder-step.active')?.appendChild(paragraph)
    paragraph.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  function providerLabelText() {
    return providerSelect.options[providerSelect.selectedIndex]?.text || 'destination'
  }

  function setPreview(prepared) {
    preview.hidden = !prepared.destinationUrl
    if (!prepared.destinationUrl) {
      preview.removeAttribute('href')
      preview.textContent = ''
      return
    }
    preview.href = prepared.destinationUrl
    preview.textContent = `Beslyfe will use: ${prepared.destinationUrl}`
  }

  function syncDestinationUi({ providerChanged = false } = {}) {
    const providerKey = providerSelect.value
    if (!providerKey) return
    const kind = paymentInputKind(providerKey)
    if (providerChanged || (lastProvider && lastProvider !== providerKey)) input.value = ''
    lastProvider = providerKey
    clearError()

    if (kind === 'built-in') {
      field.hidden = true
      input.required = false
      input.value = ''
      input.type = 'text'
      note.hidden = false
      note.textContent = 'Beslyfe will create and connect an internal lead form for this plan. No payment username or external URL is required.'
      setPreview({ destinationUrl: '' })
      return
    }

    field.hidden = false
    note.hidden = false
    input.required = true
    if (kind === 'handle') {
      input.type = 'text'
      if (providerKey === 'cash-app') {
        label.textContent = 'Cash App $Cashtag'
        input.placeholder = '$xekimx'
        help.textContent = 'Enter xekimx, $xekimx, @$xekimx, or a complete https://cash.app/$xekimx link. Beslyfe stores one canonical Cashtag and creates the final URL.'
      } else {
        label.textContent = `${providerLabelText()} username`
        input.placeholder = '@username'
        help.textContent = `Enter the ${providerLabelText()} username or its complete profile URL. Beslyfe stores one canonical username and creates the final URL.`
      }
      note.textContent = 'Use a business or commercial profile when the provider requires one for sales.'
    } else {
      input.type = 'url'
      label.textContent = 'Secure payment link'
      input.placeholder = 'https://'
      help.textContent = `Paste the complete secure https:// link created by ${providerLabelText()}.`
      note.textContent = 'Only complete HTTPS checkout, booking, donation, or external destination links are accepted.'
    }
    setPreview(preparePaymentDestination(providerKey, input.value))
  }

  function syncSoon(options) {
    queueMicrotask(() => syncDestinationUi(options))
    setTimeout(() => syncDestinationUi(options), 0)
  }

  providerSelect.addEventListener('change', () => syncSoon({ providerChanged: true }))
  modeSelect.addEventListener('change', () => syncSoon({ providerChanged: true }))
  input.addEventListener('input', () => {
    clearError()
    setPreview(preparePaymentDestination(providerSelect.value, input.value))
  })

  new MutationObserver(() => syncSoon()).observe(providerSelect, { childList: true, subtree: true })
  syncSoon()
  setTimeout(() => syncDestinationUi(), 500)

  function readSnapshot() {
    try {
      const snapshot = JSON.parse(localStorage.getItem('beslyfe_build_draft') || 'null')
      return snapshot && typeof snapshot === 'object' ? snapshot : {}
    } catch {
      return {}
    }
  }

  function deriveExperiment() {
    const chosen = fieldValue('startingExperiment') || 'unsure'
    if (chosen !== 'unsure') return chosen
    const preferences = checkedValues('workPreference')
    if (preferences.includes('service') || preferences.includes('hands-on')) return 'service'
    if (preferences.includes('products')) return 'product'
    if (preferences.includes('creator')) return 'creator'
    if (preferences.includes('organize') || preferences.includes('technical')) return 'operations'
    if (preferences.includes('community')) return 'community'
    return selectedValue('startingPoint') === 'income' ? 'service' : 'unsure'
  }

  function buildPayload() {
    const minimumAge = Number(fieldValue('minimumAge') || 0)
    const outcomes = checkedValues('outcome')
    const snapshot = readSnapshot()
    const capabilities = Array.from(document.querySelectorAll('#capabilityPicker input:checked')).map((element) => element.value)
    return {
      action: 'create',
      name: fieldValue('projectName'),
      description: fieldValue('projectDescription'),
      productType: selectedValue('productType') || snapshot.state?.productType || 'website',
      outcomes,
      primaryOutcome: outcomes[0] || 'community-growth',
      capabilities,
      minimumAge,
      contentRating: minimumAge >= 18 ? 'regulated-adult' : 'general',
      answers: {
        startingPoint: selectedValue('startingPoint'),
        incomeTiming: fieldValue('incomeTiming'),
        incomeTarget: fieldValue('incomeTarget'),
        currentIncome: fieldValue('currentIncome'),
        weeklyTime: fieldValue('weeklyTime'),
        strengths: fieldValue('strengths'),
        problemsUnderstood: fieldValue('problemsUnderstood'),
        workPreferences: checkedValues('workPreference'),
        resources: checkedValues('availableResource'),
        startingExperiment: deriveExperiment(),
        hardLimits: fieldValue('hardLimits'),
        riskMindset: selectedValue('riskMindset'),
        safetyCommitment: Boolean(document.getElementById('safetyCommitment')?.checked),
        guidanceSummary: snapshot.state?.guidanceSummary || '',
        audience: fieldValue('audience'),
        offer: fieldValue('offer'),
        operatingChallenge: fieldValue('operatingChallenge'),
        automationWish: fieldValue('automationWish'),
        minimumAge,
      },
    }
  }

  async function jsonResponse(response) {
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || 'The request could not be completed.')
    return data
  }

  async function requireAccount() {
    const response = await fetch('/.netlify/functions/auth?action=session', { headers: { Accept: 'application/json' } })
    if (!response.ok) return null
    const data = await response.json().catch(() => null)
    return data?.account || null
  }

  function showAccountGate() {
    document.getElementById('builder').hidden = true
    const gate = document.getElementById('accountGate')
    gate.hidden = false
    const status = document.getElementById('accountGateStatus')
    if (status) status.textContent = 'Create or sign in to your free account to save and create this plan. Every answer will be waiting when you return.'
    gate.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  async function clearSavedDraft() {
    try { localStorage.removeItem('beslyfe_build_draft') } catch {}
    try {
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete-draft' }),
      })
    } catch {}
  }

  function renderResult(item, channel) {
    form.hidden = true
    resultHost.hidden = false
    const capabilities = item.capabilities || []
    resultHost.innerHTML = `<div class="result-mark">✓</div><h2>Your Beslyfe action workspace is ready.</h2><p><strong>${escapeHtml(item.name)}</strong> now has a seven-day execution queue, measurable outcomes, and a modular capability plan. The first safe bot task is prepared automatically from your answers.</p><div class="result-capabilities">${capabilities.map((key) => `<span>${escapeHtml(capabilityLabels[key] || key)}</span>`).join('')}</div><p class="result-note">Your <strong>${escapeHtml(channel.actionLabel)}</strong> growth action is active through ${escapeHtml(channel.provider)}.</p><div class="result-actions"><a class="button" href="/workspace?ecosystem=${encodeURIComponent(item.id)}">Start my first test</a><a class="button secondary" href="/community">Enter the community</a></div>`
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  async function submitPlan() {
    if (submitting) return
    clearError()
    const payload = buildPayload()
    if (payload.name.length < 2) return showError('Give your project a name.')
    if (!document.getElementById('confirmPlan')?.checked) return showError('Confirm that you reviewed the recommended capabilities.')

    const providerKey = providerSelect.value
    const prepared = preparePaymentDestination(providerKey, input.value)
    if (!prepared.valid) {
      const message = prepared.kind === 'handle'
        ? `Enter a valid ${providerLabelText()} username, Cashtag, or matching provider URL.`
        : 'Paste a complete secure https payment link.'
      input.setCustomValidity(message)
      return showError(message)
    }

    submitting = true
    launchButton.disabled = true
    launchButton.textContent = createdPlan ? 'Connecting...' : 'Creating...'
    try {
      const account = await requireAccount()
      if (!account) {
        showAccountGate()
        return
      }

      if (!createdPlan) {
        const created = await jsonResponse(await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }))
        createdPlan = created.item
      }

      const destinationUrl = prepared.kind === 'built-in'
        ? `/contact?ecosystem=${encodeURIComponent(createdPlan.id)}`
        : prepared.destinationUrl
      const mode = modeSelect.value
      const channelData = await jsonResponse(await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'growth-channel',
          ecosystemId: createdPlan.id,
          mode,
          provider: providerKey,
          paymentHandle: prepared.canonicalHandle,
          offerName: fieldValue('offer').slice(0, 200) || createdPlan.name,
          actionLabel: actionLabels[mode] || 'Get started',
          destinationUrl,
        }),
      }))

      await clearSavedDraft()
      renderResult(createdPlan, channelData.item)
      createdPlan = null
    } catch (error) {
      showError(error.message || 'The plan could not be created.')
    } finally {
      submitting = false
      if (!form.hidden) {
        launchButton.disabled = false
        launchButton.textContent = createdPlan ? 'Retry growth action' : 'Create my Beslyfe plan'
      }
    }
  }

  launchButton.addEventListener('click', submitPlan)
  form.addEventListener('submit', (event) => {
    event.preventDefault()
    event.stopImmediatePropagation()
    submitPlan()
  }, true)
})
