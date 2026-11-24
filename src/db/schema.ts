/**
 * Local SQLite schema.
 *
 * Multi-tenancy rule: every tenant-owned row carries `owner_id`, and every
 * repository query filters on it. On this device that is usually a single
 * owner, but the column keeps isolation explicit and lets a device hold more
 * than one owner without leaking data between them.
 *
 * Values are stored in SQLite-friendly primitives:
 *   ids        TEXT (cuid-like)
 *   money      REAL (rupees)
 *   booleans   INTEGER 0/1
 *   timestamps TEXT ISO-8601 UTC
 */
export const SCHEMA_VERSION = 3

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS owner (
  id          TEXT PRIMARY KEY NOT NULL,
  name        TEXT NOT NULL,
  email       TEXT,
  phone       TEXT,
  public_key  TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS client (
  id            TEXT PRIMARY KEY NOT NULL,
  owner_id      TEXT NOT NULL,
  name          TEXT NOT NULL,
  phone         TEXT,
  email         TEXT,
  public_key    TEXT,
  status        TEXT NOT NULL DEFAULT 'pending', -- pending | active | revoked
  notes         TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  FOREIGN KEY (owner_id) REFERENCES owner(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_client_owner ON client(owner_id);

CREATE TABLE IF NOT EXISTS project (
  id                       TEXT PRIMARY KEY NOT NULL,
  owner_id                 TEXT NOT NULL,
  client_id                TEXT,
  name                     TEXT NOT NULL,
  description              TEXT,
  site_address             TEXT,
  status                   TEXT NOT NULL DEFAULT 'planning',
  budget                   REAL NOT NULL DEFAULT 0,
  client_managed_expenses  INTEGER NOT NULL DEFAULT 0,
  start_date               TEXT,
  end_date                 TEXT,
  created_at               TEXT NOT NULL,
  updated_at               TEXT NOT NULL,
  FOREIGN KEY (owner_id) REFERENCES owner(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES client(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_project_owner ON project(owner_id);
CREATE INDEX IF NOT EXISTS idx_project_client ON project(client_id);

CREATE TABLE IF NOT EXISTS project_phase (
  id          TEXT PRIMARY KEY NOT NULL,
  owner_id    TEXT NOT NULL,
  project_id  TEXT NOT NULL,
  name        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',
  start_date  TEXT,
  end_date    TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES project(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_phase_project ON project_phase(project_id);

CREATE TABLE IF NOT EXISTS vendor (
  id          TEXT PRIMARY KEY NOT NULL,
  owner_id    TEXT NOT NULL,
  name        TEXT NOT NULL,
  phone       TEXT,
  email       TEXT,
  address     TEXT,
  gst_number  TEXT,
  category    TEXT,
  notes       TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  FOREIGN KEY (owner_id) REFERENCES owner(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_vendor_owner ON vendor(owner_id);

CREATE TABLE IF NOT EXISTS contractor (
  id          TEXT PRIMARY KEY NOT NULL,
  owner_id    TEXT NOT NULL,
  name        TEXT NOT NULL,
  phone       TEXT,
  trade       TEXT NOT NULL DEFAULT 'other',
  notes       TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  FOREIGN KEY (owner_id) REFERENCES owner(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_contractor_owner ON contractor(owner_id);

CREATE TABLE IF NOT EXISTS income (
  id                TEXT PRIMARY KEY NOT NULL,
  owner_id          TEXT NOT NULL,
  project_id        TEXT NOT NULL,
  phase_id          TEXT,
  date              TEXT NOT NULL,
  amount            REAL NOT NULL,
  payment_type      TEXT NOT NULL DEFAULT 'advance',
  payment_mode      TEXT NOT NULL DEFAULT 'cash',
  received_from     TEXT,
  reference_number  TEXT,
  notes             TEXT,
  created_at        TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES project(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_income_project ON income(project_id);

CREATE TABLE IF NOT EXISTS expense (
  id                      TEXT PRIMARY KEY NOT NULL,
  owner_id                TEXT NOT NULL,
  project_id              TEXT NOT NULL,
  phase_id                TEXT,
  date                    TEXT NOT NULL,
  amount                  REAL NOT NULL,
  tax_amount              REAL NOT NULL DEFAULT 0,
  category                TEXT NOT NULL,
  vendor_id               TEXT,
  vendor_name             TEXT,
  contractor_id           TEXT,
  labor_entry_id          TEXT,
  payment_mode            TEXT NOT NULL DEFAULT 'cash',
  bill_number             TEXT,
  is_reimbursable         INTEGER NOT NULL DEFAULT 0,
  paid_by_client          INTEGER NOT NULL DEFAULT 0,
  notes                   TEXT,
  approval_status         TEXT NOT NULL DEFAULT 'approved', -- approved | pending | rejected
  submitted_by_client_id  TEXT,
  created_at              TEXT NOT NULL,
  updated_at              TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES project(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_expense_project ON expense(project_id);
CREATE INDEX IF NOT EXISTS idx_expense_status ON expense(approval_status);

CREATE TABLE IF NOT EXISTS labor_entry (
  id            TEXT PRIMARY KEY NOT NULL,
  owner_id      TEXT NOT NULL,
  project_id    TEXT NOT NULL,
  phase_id      TEXT,
  contractor_id TEXT,
  trade_type    TEXT NOT NULL DEFAULT 'other',
  rate_type     TEXT NOT NULL DEFAULT 'fixed',
  rate_amount   REAL NOT NULL DEFAULT 0,
  quantity      REAL NOT NULL DEFAULT 1,
  total_amount  REAL NOT NULL DEFAULT 0,
  advance_paid  REAL NOT NULL DEFAULT 0,
  start_date    TEXT,
  end_date      TEXT,
  status        TEXT NOT NULL DEFAULT 'ongoing',
  paid_by_client INTEGER NOT NULL DEFAULT 0,
  notes         TEXT,
  created_at    TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES project(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_labor_project ON labor_entry(project_id);

CREATE TABLE IF NOT EXISTS material_entry (
  id             TEXT PRIMARY KEY NOT NULL,
  owner_id       TEXT NOT NULL,
  project_id     TEXT NOT NULL,
  phase_id       TEXT,
  description    TEXT NOT NULL,
  category       TEXT NOT NULL DEFAULT 'materials',
  vendor_id      TEXT,
  vendor_name    TEXT,
  bill_number    TEXT,
  bill_date      TEXT,
  bill_amount    REAL NOT NULL DEFAULT 0,
  paid_by_client INTEGER NOT NULL DEFAULT 0,
  notes          TEXT,
  created_at     TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES project(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_material_project ON material_entry(project_id);

CREATE TABLE IF NOT EXISTS material_payment (
  id                TEXT PRIMARY KEY NOT NULL,
  owner_id          TEXT NOT NULL,
  material_entry_id TEXT NOT NULL,
  amount            REAL NOT NULL,
  date              TEXT NOT NULL,
  payment_mode      TEXT NOT NULL DEFAULT 'cash',
  reference_number  TEXT,
  notes             TEXT,
  created_at        TEXT NOT NULL,
  FOREIGN KEY (material_entry_id) REFERENCES material_entry(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_mpayment_entry ON material_payment(material_entry_id);

CREATE TABLE IF NOT EXISTS milestone (
  id              TEXT PRIMARY KEY NOT NULL,
  owner_id        TEXT NOT NULL,
  project_id      TEXT NOT NULL,
  phase_id        TEXT,
  title           TEXT NOT NULL,
  description     TEXT,
  due_date        TEXT,
  completion_date TEXT,
  status          TEXT NOT NULL DEFAULT 'pending',
  created_at      TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES project(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_milestone_project ON milestone(project_id);

CREATE TABLE IF NOT EXISTS note (
  id           TEXT PRIMARY KEY NOT NULL,
  owner_id     TEXT NOT NULL,
  project_id   TEXT,
  milestone_id TEXT,
  content      TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES project(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_note_project ON note(project_id);

CREATE TABLE IF NOT EXISTS activity_log (
  id          TEXT PRIMARY KEY NOT NULL,
  owner_id    TEXT NOT NULL,
  project_id  TEXT,
  actor_type  TEXT NOT NULL DEFAULT 'owner', -- owner | client | system
  actor_id    TEXT,
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   TEXT,
  details     TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activity_project ON activity_log(project_id);

-- Owner <-> client messages. Incoming packs land here as 'pending' until the
-- user reviews and applies them, so an imported file can never silently
-- rewrite financial data.
CREATE TABLE IF NOT EXISTS message (
  id                TEXT PRIMARY KEY NOT NULL,
  owner_id          TEXT NOT NULL,
  direction         TEXT NOT NULL, -- in | out
  pack_id           TEXT NOT NULL,
  fingerprint       TEXT NOT NULL,
  kind              TEXT NOT NULL,
  counterparty_id   TEXT NOT NULL,
  counterparty_name TEXT NOT NULL,
  sender_public_key TEXT NOT NULL,
  payload           TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending', -- pending | applied | failed | sent
  error             TEXT,
  created_at        TEXT NOT NULL,
  applied_at        TEXT,
  UNIQUE(owner_id, direction, fingerprint)
);
CREATE INDEX IF NOT EXISTS idx_message_owner ON message(owner_id, direction);

CREATE TABLE IF NOT EXISTS app_meta (
  key   TEXT PRIMARY KEY NOT NULL,
  value TEXT
);
`

/**
 * v2 — client mode.
 *
 * A device acting as a client must not write into the owner tables. Shared
 * project snapshots are stored separately, exactly as received, so the client
 * app can only ever display what was sent.
 */
export const SCHEMA_V2_SQL = `
CREATE TABLE IF NOT EXISTS client_profile (
  id                TEXT PRIMARY KEY NOT NULL,
  owner_remote_id   TEXT NOT NULL,
  owner_name        TEXT NOT NULL,
  owner_public_key  TEXT NOT NULL,
  client_remote_id  TEXT NOT NULL,
  pairing_code      TEXT,
  name              TEXT NOT NULL,
  created_at        TEXT NOT NULL,
  UNIQUE(owner_public_key, client_remote_id)
);

CREATE TABLE IF NOT EXISTS pairing (
  client_id   TEXT PRIMARY KEY NOT NULL,
  owner_id    TEXT NOT NULL,
  code        TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shared_project (
  id                TEXT PRIMARY KEY NOT NULL, -- <clientProfileId>:<remoteProjectId>
  client_profile_id TEXT NOT NULL,
  remote_project_id TEXT NOT NULL,
  name              TEXT NOT NULL,
  status            TEXT,
  site_address      TEXT,
  budget            REAL NOT NULL DEFAULT 0,
  summary           TEXT NOT NULL,
  milestones        TEXT NOT NULL,
  expenses          TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  fingerprint       TEXT NOT NULL,
  FOREIGN KEY (client_profile_id) REFERENCES client_profile(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_shared_profile ON shared_project(client_profile_id);

CREATE TABLE IF NOT EXISTS client_outbox (
  id                TEXT PRIMARY KEY NOT NULL,
  client_profile_id TEXT NOT NULL,
  pack_id           TEXT NOT NULL,
  kind              TEXT NOT NULL,
  fingerprint       TEXT NOT NULL,
  payload           TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending', -- pending | sent | answered
  created_at        TEXT NOT NULL,
  UNIQUE(client_profile_id, fingerprint),
  FOREIGN KEY (client_profile_id) REFERENCES client_profile(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_outbox_profile ON client_outbox(client_profile_id);
`

/**
 * v3 — attachments.
 *
 * Only a path RELATIVE to the app document directory is stored. On iOS the
 * container UUID changes between installs, so absolute URIs go stale.
 */
export const SCHEMA_V3_SQL = `
CREATE TABLE IF NOT EXISTS attachment (
  id            TEXT PRIMARY KEY NOT NULL,
  owner_id      TEXT NOT NULL,
  project_id    TEXT NOT NULL,
  expense_id    TEXT,
  kind          TEXT NOT NULL DEFAULT 'image',
  file_name     TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  mime_type     TEXT,
  size          INTEGER,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attachment_project ON attachment(project_id);
`
