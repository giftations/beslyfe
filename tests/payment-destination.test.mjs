import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import {
  normalizePaymentHandle,
  paymentDestinationFromHandle,
} from '../platform/growth/sales-engine-contract.mjs'
import {
  paymentInputKind,
  preparePaymentDestination,
  securePaymentDestination,
} from '../platform/growth/payment-destination.mjs'

test('payment destination browser controller has valid JavaScript syntax', () => {
  const controller = fileURLToPath(new URL('../assets/js/payment-destination-controller.mjs', import.meta.url))
  execFileSync(process.execPath, ['--check', controller], { stdio: 'pipe' })
})

test('Beslyfe lead form is a built-in destination with no payment input', () => {
  assert.equal(paymentInputKind('contact-form'), 'built-in')
  assert.deepEqual(preparePaymentDestination('contact-form', 'stale payment value'), {
    kind: 'built-in',
    valid: true,
    canonicalHandle: '',
    destinationUrl: '',
  })
})

test('Cash App inputs normalize to one canonical Cashtag and URL', () => {
  for (const value of [
    'xekimx',
    '$xekimx',
    '@$xekimx',
    'https://cash.app/$xekimx',
    '  @$$xekimx  ',
  ]) {
    assert.equal(normalizePaymentHandle('cash-app', value), 'xekimx')
    assert.equal(paymentDestinationFromHandle('cash-app', value), 'https://cash.app/$xekimx')
  }
})

test('username platforms accept matching complete provider URLs', () => {
  assert.equal(normalizePaymentHandle('paypal', 'https://paypal.me/BestShop'), 'BestShop')
  assert.equal(paymentDestinationFromHandle('paypal', 'https://paypal.me/BestShop'), 'https://paypal.me/BestShop')
  assert.equal(normalizePaymentHandle('venmo', 'https://venmo.com/u/best_shop'), 'best_shop')
  assert.equal(paymentDestinationFromHandle('venmo', 'https://venmo.com/u/best_shop'), 'https://venmo.com/u/best_shop')
})

test('invalid usernames and mismatched provider URLs are rejected', () => {
  assert.equal(normalizePaymentHandle('cash-app', '123bad'), '')
  assert.equal(normalizePaymentHandle('cash-app', 'bad-tag!'), '')
  assert.equal(normalizePaymentHandle('cash-app', 'https://venmo.com/u/xekimx'), '')
  assert.equal(paymentDestinationFromHandle('cash-app', '$$'), '')
})

test('custom destinations require complete credential-free HTTPS URLs', () => {
  assert.equal(securePaymentDestination('cash.app/$xekimx'), '')
  assert.equal(securePaymentDestination('http://example.com/pay'), '')
  assert.equal(securePaymentDestination('https://user:pass@example.com/pay'), '')
  assert.equal(securePaymentDestination('https://example.com/pay'), 'https://example.com/pay')
  assert.deepEqual(preparePaymentDestination('external', 'https://example.com/pay'), {
    kind: 'url',
    valid: true,
    canonicalHandle: '',
    destinationUrl: 'https://example.com/pay',
  })
})
