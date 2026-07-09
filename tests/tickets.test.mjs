// Unit tests for the ticketing ingestion mappers — the highest-risk new logic,
// since it turns whatever shape a ticketing company (or a relay/CSV export)
// sends into the canonical order columns. These import only pure helpers from
// tickets.mjs (no database, no network), so they stay fast and hermetic.
//
// Run with:  node --test tests/

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { toCents, normalizeOrder, extractOrders } from '../netlify/functions/tickets.mjs'

test('toCents accepts explicit cents and decimal amounts', () => {
  assert.equal(toCents(9000, undefined), 9000)           // already cents
  assert.equal(toCents(undefined, 90), 9000)             // dollars → cents
  assert.equal(toCents(undefined, '90.00'), 9000)
  assert.equal(toCents(undefined, '$1,200.50'), 120050)  // currency + separators
  assert.equal(toCents(undefined, ''), 0)                // blank → 0, never NaN
  assert.equal(toCents(undefined, undefined), 0)
  // Explicit cents wins over the decimal field when both are present.
  assert.equal(toCents(500, 90), 500)
})

test('normalizeOrder maps our documented contract', () => {
  const o = normalizeOrder({
    orderId: 'EB-1', buyerName: 'Jane Doe', buyerEmail: 'Jane@Example.com',
    status: 'completed', tier: 'VIP', quantity: 2, gross: 120, fees: 10,
    purchasedAt: '2026-07-01T18:00:00Z',
  })
  assert.equal(o.externalOrderId, 'EB-1')
  assert.equal(o.buyerEmail, 'jane@example.com')          // lowercased
  assert.equal(o.tierName, 'VIP')
  assert.equal(o.quantity, 2)
  assert.equal(o.grossCents, 12000)
  assert.equal(o.feesCents, 1000)
  assert.equal(o.netCents, 11000)                          // gross − fees when net absent
  assert.equal(o.status, 'completed')
  assert.ok(o.purchasedAt.startsWith('2026-07-01'))
})

test('normalizeOrder tolerates common vendor field names', () => {
  // Eventbrite-ish payload: id, email, costs.gross.value, ticket_class_name.
  const o = normalizeOrder({
    id: '778', email: 'a@b.com', status: 'placed',
    costs: { gross: { value: 4500, currency: 'USD' } },
    ticket_class_name: 'General Admission',
  })
  assert.equal(o.externalOrderId, '778')
  assert.equal(o.grossCents, 4500)
  assert.equal(o.tierName, 'General Admission')
  // An unknown status falls back to 'completed' rather than being dropped.
  assert.equal(o.status, 'completed')
})

test('normalizeOrder maps refund/paid aliases and defaults', () => {
  assert.equal(normalizeOrder({ status: 'refund' }).status, 'refunded')
  assert.equal(normalizeOrder({ status: 'paid' }).status, 'completed')
  const bare = normalizeOrder({})
  assert.equal(bare.status, 'completed')
  assert.equal(bare.tierName, 'General')                   // sensible default tier
  assert.equal(bare.quantity, 1)                           // an order is at least 1 ticket
  assert.equal(bare.currency, 'USD')
})

test('extractOrders unwraps every envelope shape', () => {
  assert.equal(extractOrders({ orders: [{ id: 1 }, { id: 2 }] }).length, 2)
  assert.equal(extractOrders([{ id: 1 }]).length, 1)         // bare array
  assert.equal(extractOrders({ order: { id: 1 } }).length, 1) // single { order }
  assert.equal(extractOrders({ data: [{ id: 1 }] }).length, 1)
  assert.equal(extractOrders({ orderId: 'X' }).length, 1)     // single top-level order
  assert.equal(extractOrders({}).length, 0)                   // nothing usable
  assert.equal(extractOrders(null).length, 0)
})
