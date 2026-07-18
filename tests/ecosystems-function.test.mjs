import test from 'node:test'
import assert from 'node:assert/strict'

import { safeDestination, slugify } from '../netlify/functions/ecosystems.mjs'

test('ecosystem slugs are stable and safe for public routes', () => {
  assert.equal(slugify('  My New Business!  '), 'my-new-business')
  assert.equal(slugify('***'), 'my-ecosystem')
})

test('growth destinations accept secure provider links and reject unsafe URLs', () => {
  assert.equal(safeDestination('javascript:alert(1)', 'external'), '')
  assert.equal(safeDestination('http://example.com/pay', 'external'), '')
  assert.equal(safeDestination('https://example.com/pay', 'external'), 'https://example.com/pay')
  assert.equal(safeDestination('', 'contact-form'), '/contact?source=beslyfe')
  assert.equal(safeDestination('/contact?offer=consulting', 'contact-form'), '/contact?offer=consulting')
})
