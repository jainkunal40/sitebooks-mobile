import type { SQLiteDatabase } from 'expo-sqlite'
import { computeProjectFinance, type ProjectFinance } from '@/lib/finance'
import { createId } from '@/lib/random'
import { getDatabase, nowIso } from './index'
import {
  toFinanceInput,
  type ActivityRow,
  type ClientRow,
  type ExpenseRow,
  type IncomeRow,
  type LaborEntryRow,
  type MaterialEntryRow,
  type MaterialPaymentRow,
  type MessageRow,
  type OwnerRow,
  type ProjectBundle,
  type ProjectRow,
} from './types'

export interface ProjectSummary {
  project: ProjectRow
  client: ClientRow | null
  finance: ProjectFinance
}

// ─── Owner ──────────────────────────────────────────────────

export async function getOwner(): Promise<OwnerRow | null> {
  const db = await getDatabase()
  const row = await db.getFirstAsync<OwnerRow>('SELECT * FROM owner ORDER BY created_at LIMIT 1')
  return row ?? null
}

export async function createOwner(input: {
  name: string
  email?: string | null
  phone?: string | null
  publicKey: string
}): Promise<OwnerRow> {
  const db = await getDatabase()
  const now = nowIso()
  const owner: OwnerRow = {
    id: createId('usr'),
    name: input.name.trim(),
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    public_key: input.publicKey,
    created_at: now,
    updated_at: now,
  }
  await db.runAsync(
    `INSERT INTO owner (id, name, email, phone, public_key, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [owner.id, owner.name, owner.email, owner.phone, owner.public_key, owner.created_at, owner.updated_at]
  )
  return owner
}

// ─── Clients ────────────────────────────────────────────────

export async function listClients(ownerId: string): Promise<ClientRow[]> {
  const db = await getDatabase()
  return db.getAllAsync<ClientRow>(
    'SELECT * FROM client WHERE owner_id = ? ORDER BY name COLLATE NOCASE',
    [ownerId]
  )
}

export async function createClient(
  ownerId: string,
  input: { name: string; phone?: string | null; email?: string | null; notes?: string | null }
): Promise<ClientRow> {
  const db = await getDatabase()
  const now = nowIso()
  const client: ClientRow = {
    id: createId('cli'),
    owner_id: ownerId,
    name: input.name.trim(),
    phone: input.phone?.trim() || null,
    email: input.email?.trim() || null,
    public_key: null,
    status: 'pending',
    notes: input.notes?.trim() || null,
    created_at: now,
    updated_at: now,
  }
  await db.runAsync(
    `INSERT INTO client (id, owner_id, name, phone, email, public_key, status, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      client.id,
      client.owner_id,
      client.name,
      client.phone,
      client.email,
      client.public_key,
      client.status,
      client.notes,
      client.created_at,
      client.updated_at,
    ]
  )
  return client
}

export async function pairClientKey(
  ownerId: string,
  clientId: string,
  publicKey: string
): Promise<void> {
  const db = await getDatabase()
  await db.runAsync(
    `UPDATE client SET public_key = ?, status = 'active', updated_at = ?
     WHERE id = ? AND owner_id = ?`,
    [publicKey, nowIso(), clientId, ownerId]
  )
}

// ─── Projects ───────────────────────────────────────────────

export async function listProjects(ownerId: string): Promise<ProjectRow[]> {
  const db = await getDatabase()
  return db.getAllAsync<ProjectRow>(
    'SELECT * FROM project WHERE owner_id = ? ORDER BY created_at DESC',
    [ownerId]
  )
}

export async function getProject(
  ownerId: string,
  projectId: string
): Promise<ProjectRow | null> {
  const db = await getDatabase()
  return db.getFirstAsync<ProjectRow>(
    'SELECT * FROM project WHERE id = ? AND owner_id = ?',
    [projectId, ownerId]
  )
}

export async function createProject(
  ownerId: string,
  input: {
    name: string
    clientId?: string | null
    description?: string | null
    siteAddress?: string | null
    status?: string
    budget?: number
    clientManagedExpenses?: boolean
  }
): Promise<ProjectRow> {
  const db = await getDatabase()
  const now = nowIso()
  const project: ProjectRow = {
    id: createId('prj'),
    owner_id: ownerId,
    client_id: input.clientId || null,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    site_address: input.siteAddress?.trim() || null,
    status: input.status || 'planning',
    budget: input.budget ?? 0,
    client_managed_expenses: input.clientManagedExpenses ? 1 : 0,
    start_date: null,
    end_date: null,
    created_at: now,
    updated_at: now,
  }
  await db.runAsync(
    `INSERT INTO project
      (id, owner_id, client_id, name, description, site_address, status, budget,
       client_managed_expenses, start_date, end_date, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      project.id,
      project.owner_id,
      project.client_id,
      project.name,
      project.description,
      project.site_address,
      project.status,
      project.budget,
      project.client_managed_expenses,
      project.start_date,
      project.end_date,
      project.created_at,
      project.updated_at,
    ]
  )
  return project
}

/** Loads a project with everything the finance module needs. */
export async function getProjectBundle(
  ownerId: string,
  projectId: string
): Promise<ProjectBundle | null> {
  const db = await getDatabase()
  const project = await db.getFirstAsync<ProjectRow>(
    'SELECT * FROM project WHERE id = ? AND owner_id = ?',
    [projectId, ownerId]
  )
  if (!project) return null

  const [client, income, expenses, materials, payments, labor] = await Promise.all([
    project.client_id
      ? db.getFirstAsync<ClientRow>('SELECT * FROM client WHERE id = ? AND owner_id = ?', [
          project.client_id,
          ownerId,
        ])
      : Promise.resolve(null),
    db.getAllAsync<IncomeRow>('SELECT * FROM income WHERE project_id = ? AND owner_id = ? ORDER BY date', [
      projectId,
      ownerId,
    ]),
    db.getAllAsync<ExpenseRow>(
      'SELECT * FROM expense WHERE project_id = ? AND owner_id = ? ORDER BY date',
      [projectId, ownerId]
    ),
    db.getAllAsync<MaterialEntryRow>(
      'SELECT * FROM material_entry WHERE project_id = ? AND owner_id = ? ORDER BY COALESCE(bill_date, created_at)',
      [projectId, ownerId]
    ),
    db.getAllAsync<MaterialPaymentRow>(
      `SELECT p.* FROM material_payment p
       JOIN material_entry e ON e.id = p.material_entry_id
       WHERE e.project_id = ? AND p.owner_id = ? ORDER BY p.date`,
      [projectId, ownerId]
    ),
    db.getAllAsync<LaborEntryRow>(
      'SELECT * FROM labor_entry WHERE project_id = ? AND owner_id = ? ORDER BY created_at',
      [projectId, ownerId]
    ),
  ])

  const paymentsByEntry = new Map<string, MaterialPaymentRow[]>()
  for (const payment of payments) {
    const list = paymentsByEntry.get(payment.material_entry_id) ?? []
    list.push(payment)
    paymentsByEntry.set(payment.material_entry_id, list)
  }

  return {
    project,
    client: client ?? null,
    income,
    expenses,
    materialEntries: materials.map((entry) => ({
      ...entry,
      payments: paymentsByEntry.get(entry.id) ?? [],
    })),
    laborEntries: labor,
  }
}

/** Dashboard list: every project with a single consistent set of totals. */
export async function listProjectSummaries(ownerId: string): Promise<ProjectSummary[]> {
  const db = await getDatabase()
  const projects = await listProjects(ownerId)
  if (projects.length === 0) return []

  const [clients, income, expenses, materials, payments, labor] = await Promise.all([
    listClients(ownerId),
    db.getAllAsync<IncomeRow>('SELECT * FROM income WHERE owner_id = ?', [ownerId]),
    db.getAllAsync<ExpenseRow>('SELECT * FROM expense WHERE owner_id = ?', [ownerId]),
    db.getAllAsync<MaterialEntryRow>('SELECT * FROM material_entry WHERE owner_id = ?', [ownerId]),
    db.getAllAsync<MaterialPaymentRow>('SELECT * FROM material_payment WHERE owner_id = ?', [ownerId]),
    db.getAllAsync<LaborEntryRow>('SELECT * FROM labor_entry WHERE owner_id = ?', [ownerId]),
  ])

  const group = <T extends { project_id: string }>(rows: T[]) => {
    const map = new Map<string, T[]>()
    for (const row of rows) {
      const list = map.get(row.project_id) ?? []
      list.push(row)
      map.set(row.project_id, list)
    }
    return map
  }

  const incomeByProject = group(income)
  const expenseByProject = group(expenses)
  const materialByProject = group(materials)
  const laborByProject = group(labor)

  const paymentsByEntry = new Map<string, MaterialPaymentRow[]>()
  for (const payment of payments) {
    const list = paymentsByEntry.get(payment.material_entry_id) ?? []
    list.push(payment)
    paymentsByEntry.set(payment.material_entry_id, list)
  }

  const clientsById = new Map(clients.map((client) => [client.id, client]))

  return projects.map((project) => {
    const projectMaterials = (materialByProject.get(project.id) ?? []).map((entry) => ({
      ...entry,
      payments: paymentsByEntry.get(entry.id) ?? [],
    }))

    const finance = computeProjectFinance(
      toFinanceInput({
        project,
        client: project.client_id ? clientsById.get(project.client_id) ?? null : null,
        income: incomeByProject.get(project.id) ?? [],
        expenses: expenseByProject.get(project.id) ?? [],
        materialEntries: projectMaterials,
        laborEntries: laborByProject.get(project.id) ?? [],
      })
    )

    return {
      project,
      client: project.client_id ? clientsById.get(project.client_id) ?? null : null,
      finance,
    }
  })
}

// ─── Messages ───────────────────────────────────────────────

export async function listMessages(ownerId: string, direction?: 'in' | 'out'): Promise<MessageRow[]> {
  const db = await getDatabase()
  if (direction) {
    return db.getAllAsync<MessageRow>(
      'SELECT * FROM message WHERE owner_id = ? AND direction = ? ORDER BY created_at DESC',
      [ownerId, direction]
    )
  }
  return db.getAllAsync<MessageRow>(
    'SELECT * FROM message WHERE owner_id = ? ORDER BY created_at DESC',
    [ownerId]
  )
}

export async function countPendingMessages(ownerId: string): Promise<number> {
  const db = await getDatabase()
  const row = await db.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM message WHERE owner_id = ? AND direction = 'in' AND status = 'pending'",
    [ownerId]
  )
  return row?.n ?? 0
}

/** Finds a paired client by the public key they sign packs with. */
export async function findClientByPublicKey(
  ownerId: string,
  publicKey: string
): Promise<ClientRow | null> {
  const db = await getDatabase()
  return db.getFirstAsync<ClientRow>(
    'SELECT * FROM client WHERE owner_id = ? AND public_key = ?',
    [ownerId, publicKey]
  )
}


/** Most recent activity for a project, newest first. */
export async function listActivity(
  ownerId: string,
  projectId: string,
  limit = 100
): Promise<ActivityRow[]> {
  const db = await getDatabase()
  return db.getAllAsync<ActivityRow>(
    'SELECT * FROM activity_log WHERE owner_id = ? AND project_id = ? ORDER BY created_at DESC LIMIT ?',
    [ownerId, projectId, limit]
  )
}

export async function deleteProject(ownerId: string, projectId: string): Promise<void> {
  const db = await getDatabase()
  await db.runAsync('DELETE FROM project WHERE id = ? AND owner_id = ?', [projectId, ownerId])
}

export async function updateProject(
  ownerId: string,
  projectId: string,
  input: {
    name?: string
    status?: string
    budget?: number
    siteAddress?: string | null
    description?: string | null
    clientId?: string | null
    clientManagedExpenses?: boolean
  }
): Promise<void> {
  const db = await getDatabase()
  const old = await db.getFirstAsync<ProjectRow>(
    'SELECT * FROM project WHERE id = ? AND owner_id = ?',
    [projectId, ownerId]
  )
  if (!old) throw new Error('Project not found')

  await db.runAsync(
    `UPDATE project SET name = ?, status = ?, budget = ?, site_address = ?, description = ?,
       client_id = ?, client_managed_expenses = ?, updated_at = ?
     WHERE id = ? AND owner_id = ?`,
    [
      input.name?.trim() || old.name,
      input.status ?? old.status,
      input.budget ?? old.budget,
      input.siteAddress !== undefined ? input.siteAddress : old.site_address,
      input.description !== undefined ? input.description : old.description,
      input.clientId !== undefined ? input.clientId : old.client_id,
      input.clientManagedExpenses !== undefined
        ? input.clientManagedExpenses
          ? 1
          : 0
        : old.client_managed_expenses,
      nowIso(),
      projectId,
      ownerId,
    ]
  )
}
