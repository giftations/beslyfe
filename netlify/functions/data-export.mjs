import { getDatabase } from '@netlify/database'
import { requireAdmin, json, logError } from './lib/session.mjs'

// ── Data export ──
//
// The "collect everything into one industry-standard folder" endpoint. It gives
// the admin a single place to pull every record of user data the platform holds
// as CSV — the universal, spreadsheet-native format every CRM, mail tool and
// accountant can open — or as one JSON bundle for a full backup.
//
// Read-only and admin-only: it never mutates anything and touches no new tables,
// so it can never drift from the source of truth. Each dataset degrades to empty
// (never a 500) if its table is absent, so a fresh install still exports cleanly.
//
//   GET ?dataset=<name>&format=csv   → one dataset as a CSV download
//   GET ?dataset=all&format=json     → every dataset in one JSON document
//   GET ?manifest=1                  → the list of datasets and their row counts

// Each dataset is a labelled query plus the ordered columns to emit. Adding a
// dataset here surfaces it in every export path and the admin UI at once.
const DATASETS = {
  people: {
    label: 'CRM People',
    columns: ['id', 'full_name', 'email', 'phone', 'company_id', 'title', 'notes', 'created_at', 'updated_at'],
    query: (db) => db.sql`SELECT "id","full_name","email","phone","company_id","title","notes","created_at","updated_at" FROM crm_people ORDER BY "created_at" DESC`,
  },
  companies: {
    label: 'CRM Companies',
    columns: ['id', 'name', 'website', 'industry', 'notes', 'created_at', 'updated_at'],
    query: (db) => db.sql`SELECT "id","name","website","industry","notes","created_at","updated_at" FROM crm_companies ORDER BY "created_at" DESC`,
  },
  applications: {
    label: 'Applications',
    columns: ['id', 'event_id', 'type', 'name', 'email', 'status', 'created_at', 'updated_at'],
    query: (db) => db.sql`SELECT "id","event_id","type","name","email","status","created_at","updated_at" FROM applications ORDER BY "created_at" DESC`,
  },
  profiles: {
    label: 'Directory Profiles',
    columns: ['id', 'event_id', 'role', 'display_name', 'email', 'company', 'status', 'website', 'created_at'],
    query: (db) => db.sql`SELECT "id","event_id","role","display_name","email","company","status","website","created_at" FROM profiles ORDER BY "created_at" DESC`,
  },
  accounts: {
    label: 'Member Accounts',
    columns: ['id', 'email', 'username', 'name', 'role', 'status', 'email_verified', 'created_at'],
    query: (db) => db.sql`SELECT "id","email","username","name","role","status","email_verified","created_at" FROM accounts ORDER BY "created_at" DESC`,
  },
  ticket_orders: {
    label: 'Ticket Orders',
    columns: ['id', 'provider', 'external_order_id', 'buyer_name', 'buyer_email', 'status', 'tier_name', 'quantity', 'gross_cents', 'fees_cents', 'net_cents', 'currency', 'purchased_at'],
    query: (db) => db.sql`SELECT "id","provider","external_order_id","buyer_name","buyer_email","status","tier_name","quantity","gross_cents","fees_cents","net_cents","currency","purchased_at" FROM ticket_orders ORDER BY "purchased_at" DESC NULLS LAST, "created_at" DESC`,
  },
  attendees: {
    label: 'Attendees',
    columns: ['source', 'name', 'email', 'detail', 'created_at'],
    // A unified attendee view: attendee-role profiles plus every ticket buyer,
    // so "who is coming" is one exportable list regardless of how they arrived.
    query: (db) => db.sql`
      SELECT 'profile' AS source, "display_name" AS name, "email" AS email, "role" AS detail, "created_at" FROM profiles WHERE "role" = 'attendee'
      UNION ALL
      SELECT 'ticket' AS source, "buyer_name" AS name, "buyer_email" AS email, "tier_name" AS detail, COALESCE("purchased_at","created_at") AS created_at
        FROM ticket_orders WHERE "status" = 'completed' AND "buyer_email" <> ''
      ORDER BY "created_at" DESC`,
  },
}

// RFC-4180 CSV cell: wrap in quotes when the value contains a comma, quote,
// newline or a leading/trailing space, doubling any embedded quotes.
function csvCell(value) {
  if (value === null || value === undefined) return ''
  let s = value instanceof Date ? value.toISOString() : String(value)
  if (typeof value === 'object' && !(value instanceof Date)) s = JSON.stringify(value)
  if (/[",\n\r]/.test(s) || /^\s|\s$/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}
function toCsv(columns, rows) {
  const header = columns.join(',')
  const body = rows.map((r) => columns.map((c) => csvCell(r[c])).join(',')).join('\r\n')
  return rows.length ? header + '\r\n' + body + '\r\n' : header + '\r\n'
}

async function runDataset(db, key) {
  const def = DATASETS[key]
  if (!def) return null
  try {
    const rows = await def.query(db)
    return rows.map((r) => {
      const out = {}
      for (const c of def.columns) out[c] = r[c] instanceof Date ? r[c].toISOString() : r[c]
      return out
    })
  } catch (error) {
    logError('data-export', `dataset ${key} failed`, error)
    return []
  }
}

// A filename-safe date stamp (YYYY-MM-DD) so downloads sort chronologically.
function stamp() {
  return new Date().toISOString().slice(0, 10)
}

export default async (req) => {
  if (req.method !== 'GET') return json({ error: 'Method Not Allowed' }, 405)
  const db = getDatabase()
  const admin = await requireAdmin(req, db)
  if (admin instanceof Response) return admin

  const url = new URL(req.url)

  // Manifest: what can be exported and how big each set is.
  if (url.searchParams.get('manifest') === '1') {
    const items = []
    for (const [key, def] of Object.entries(DATASETS)) {
      const rows = await runDataset(db, key)
      items.push({ key, label: def.label, columns: def.columns, count: rows ? rows.length : 0 })
    }
    return json({ datasets: items, generatedAt: new Date().toISOString() })
  }

  const dataset = url.searchParams.get('dataset') || 'all'
  const format = (url.searchParams.get('format') || 'csv').toLowerCase()

  // Full JSON backup of every dataset.
  if (dataset === 'all') {
    const bundle = { generatedAt: new Date().toISOString(), datasets: {} }
    for (const key of Object.keys(DATASETS)) bundle.datasets[key] = await runDataset(db, key)
    return new Response(JSON.stringify(bundle, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'Content-Disposition': `attachment; filename="beslyfe-data-export-${stamp()}.json"`,
      },
    })
  }

  const def = DATASETS[dataset]
  if (!def) return json({ error: 'Unknown dataset.' }, 400)
  const rows = await runDataset(db, dataset)

  if (format === 'json') {
    return new Response(JSON.stringify({ dataset, rows }, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'Content-Disposition': `attachment; filename="beslyfe-${dataset}-${stamp()}.json"`,
      },
    })
  }

  const csv = toCsv(def.columns, rows)
  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Disposition': `attachment; filename="beslyfe-${dataset}-${stamp()}.csv"`,
    },
  })
}
