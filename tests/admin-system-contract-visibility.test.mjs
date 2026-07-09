import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import assert from 'node:assert/strict'

test('Admin OS System view lists every newest platform contract group', async () => {
  const source = await readFile(new URL('../assets/js/admin-os.js', import.meta.url), 'utf8')

  for (const label of [
    'CRM relationships',
    'CRM pipeline stages',
    'Themes',
    'Admin OS',
    'Auth and access control',
    'Data portability',
    'Imports',
    'Migrations',
    'Release gates',
  ]) {
    assert.ok(source.includes(label), `${label} is listed in the System contract table`)
  }

  for (const summaryKey of [
    'crmRecordTypeCount',
    'crmPipelineStageCount',
    'themeRecordTypeCount',
    'adminWorkspaceTypeCount',
    'authRecordTypeCount',
    'dataPortabilityScopeCount',
    'importTargetCount',
    'migrationChangeTypeCount',
    'releaseGateAreaCount',
  ]) {
    assert.ok(source.includes(summaryKey), `${summaryKey} is rendered in the System contract table`)
  }
})
