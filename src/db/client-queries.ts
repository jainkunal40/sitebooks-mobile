import type { SQLiteDatabase } from 'expo-sqlite'
import { createId } from '@/lib/random'
import { getDatabase, nowIso } from './index'
import type { ProjectSharePayload } from '@/lib/payloads'

export interface ClientProfileRow {
  id: string
  owner_remote_id: string
  owner_name: string
  owner_public_key: string
  client_remote_id: string
  pairing_code: string | null
  name: string
  created_at: string
}

export interface SharedProjectRow {
  id: string
  client_profile_id: string
  remote_project_id: string
  name: string
  status: string | null
  site_address: string | null
  budget: number
  summary: string
  milestones: string
  expenses: string
  updated_at: string
  fingerprint: string
}

export interface OutboxRow {
  id: string
  client_profile_id: string
  pack_id: string
  kind: string
  fingerprint: string
  payload: string
  status: 'pending' | 'sent' | 'answered'
  created_at: string
}

async function dbOrThrow(): Promise<SQLiteDatabase> {
  return getDatabase()
}

// ─── Client profile ─────────────────────────────────────────

export async function getClientProfile(): Promise<ClientProfileRow | null> {
  const db = await dbOrThrow()
  return db.getFirstAsync<ClientProfileRow>('SELECT * FROM client_profile ORDER BY created_at LIMIT 1')
}

export async function saveClientProfile(input: {
  ownerRemoteId: string
  ownerName: string
  ownerPublicKey: string
  clientRemoteId: string
  pairingCode?: string | null
  name: string
}): Promise<ClientProfileRow> {
  const db = await dbOrThrow()
  const existing = await db.getFirstAsync<ClientProfileRow>(
    'SELECT * FROM client_profile WHERE owner_public_key = ? AND client_remote_id = ?',
    [input.ownerPublicKey, input.clientRemoteId]
  )
  if (existing) return existing

  const profile: ClientProfileRow = {
    id: createId('clp'),
    owner_remote_id: input.ownerRemoteId,
    owner_name: input.ownerName,
    owner_public_key: input.ownerPublicKey,
    client_remote_id: input.clientRemoteId,
    pairing_code: input.pairingCode ?? null,
    name: input.name,
    created_at: nowIso(),
  }
  await db.runAsync(
    `INSERT INTO client_profile
      (id, owner_remote_id, owner_name, owner_public_key, client_remote_id, pairing_code, name, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      profile.id,
      profile.owner_remote_id,
      profile.owner_name,
      profile.owner_public_key,
      profile.client_remote_id,
      profile.pairing_code,
      profile.name,
      profile.created_at,
    ]
  )
  return profile
}

// ─── Shared projects ────────────────────────────────────────

export interface SharedProjectView {
  id: string
  remoteProjectId: string
  name: string
  status: string | null
  siteAddress: string | null
  budget: number
  summary: ProjectSharePayload['summary']
  milestones: ProjectSharePayload['milestones']
  expenses: ProjectSharePayload['expenses']
  updatedAt: string
}

export async function listSharedProjects(profileId: string): Promise<SharedProjectView[]> {
  const db = await dbOrThrow()
  const rows = await db.getAllAsync<SharedProjectRow>(
    'SELECT * FROM shared_project WHERE client_profile_id = ? ORDER BY updated_at DESC',
    [profileId]
  )
  return rows.map(toView)
}

export async function getSharedProject(
  profileId: string,
  remoteProjectId: string
): Promise<SharedProjectView | null> {
  const db = await dbOrThrow()
  const row = await db.getFirstAsync<SharedProjectRow>(
    'SELECT * FROM shared_project WHERE id = ? AND client_profile_id = ?',
    [`${profileId}:${remoteProjectId}`, profileId]
  )
  return row ? toView(row) : null
}

export async function upsertSharedProject(
  profileId: string,
  fingerprint: string,
  payload: ProjectSharePayload
): Promise<void> {
  const db = await dbOrThrow()
  const id = `${profileId}:${payload.project.id}`
  const existing = await db.getFirstAsync<SharedProjectRow>(
    'SELECT * FROM shared_project WHERE id = ?',
    [id]
  )

  // Ignore replays and older snapshots.
  if (existing && existing.fingerprint === fingerprint) return
  if (existing && existing.updated_at > payload.generatedAt) return

  await db.runAsync(
    `INSERT INTO shared_project
      (id, client_profile_id, remote_project_id, name, status, site_address, budget,
       summary, milestones, expenses, updated_at, fingerprint)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       status = excluded.status,
       site_address = excluded.site_address,
       budget = excluded.budget,
       summary = excluded.summary,
       milestones = excluded.milestones,
       expenses = excluded.expenses,
       updated_at = excluded.updated_at,
       fingerprint = excluded.fingerprint`,
    [
      id,
      profileId,
      payload.project.id,
      payload.project.name,
      payload.project.status ?? null,
      payload.project.siteAddress ?? null,
      payload.project.budget ?? 0,
      JSON.stringify(payload.summary),
      JSON.stringify(payload.milestones ?? []),
      JSON.stringify(payload.expenses ?? []),
      payload.generatedAt,
      fingerprint,
    ]
  )
}

function toView(row: SharedProjectRow): SharedProjectView {
  return {
    id: row.id,
    remoteProjectId: row.remote_project_id,
    name: row.name,
    status: row.status,
    siteAddress: row.site_address,
    budget: row.budget,
    summary: safeParse(row.summary, {} as ProjectSharePayload['summary']),
    milestones: safeParse(row.milestones, []),
    expenses: safeParse(row.expenses, []),
    updatedAt: row.updated_at,
  }
}

function safeParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T
  } catch {
    return fallback
  }
}

// ─── Client outbox ──────────────────────────────────────────

export async function saveOutboxPack(input: {
  profileId: string
  packId: string
  kind: string
  fingerprint: string
  payload: unknown
  status?: OutboxRow['status']
}): Promise<string> {
  const db = await dbOrThrow()
  const id = createId('obx')
  await db.runAsync(
    `INSERT OR IGNORE INTO client_outbox
      (id, client_profile_id, pack_id, kind, fingerprint, payload, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.profileId,
      input.packId,
      input.kind,
      input.fingerprint,
      JSON.stringify(input.payload),
      input.status ?? 'sent',
      nowIso(),
    ]
  )
  return id
}

export async function listOutbox(profileId: string): Promise<OutboxRow[]> {
  const db = await dbOrThrow()
  return db.getAllAsync<OutboxRow>(
    'SELECT * FROM client_outbox WHERE client_profile_id = ? ORDER BY created_at DESC',
    [profileId]
  )
}

/** Marks a submitted expense as answered when the owner's decision arrives. */
export async function markOutboxAnswered(
  profileId: string,
  clientRowId: string
): Promise<boolean> {
  const db = await dbOrThrow()
  const rows = await db.getAllAsync<OutboxRow>(
    'SELECT * FROM client_outbox WHERE client_profile_id = ?',
    [profileId]
  )
  const match = rows.find((row) => {
    try {
      const payload = JSON.parse(row.payload) as { expense?: { clientRowId?: string } }
      return payload.expense?.clientRowId === clientRowId
    } catch {
      return false
    }
  })
  if (!match) return false
  await db.runAsync('UPDATE client_outbox SET status = ? WHERE id = ?', ['answered', match.id])
  return true
}
