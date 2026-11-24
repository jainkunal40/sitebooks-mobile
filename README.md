# SiteBooks Mobile

Local-first React Native app for interior-design project finance. iOS + Android from one codebase.

This is **not** a client for the Next.js web app. It shares the finance rules, nothing else.

## Why it exists

The web app needs a server, a hosted Postgres database, and a monthly bill. This app needs none of
that:

- Projects, expenses, labour and materials live in **SQLite on the device**.
- Owners and clients exchange data as **signed files** sent through WhatsApp, email or AirDrop.
- There is **no account system, no API, no cloud database, and no monthly hosting cost**.

The trade-off is that sharing is explicit rather than live: the owner taps *Share*, sends a file,
and the client's reply comes back the same way.

## Architecture

```
┌──────────────────────┐                    ┌──────────────────────┐
│ Owner device         │                    │ Client device        │
│                      │  .sbpack (signed)  │                      │
│ SQLite ──► sign ─────┼───────────────────►│ verify ──► import    │
│                      │                    │                      │
│                      │◄───────────────────┼── sign ──► SQLite    │
└──────────────────────┘  expense request   └──────────────────────┘
```

| Layer | Choice |
|---|---|
| Runtime | Expo SDK 58, React Native 0.88, React 19 |
| Routing | Expo Router (`src/app/`) |
| Storage | `expo-sqlite` with hand-written migrations (`src/db`) |
| Finance rules | `src/lib/finance.ts` — copied verbatim from the web app, same tests |
| Identity | Ed25519 via `@noble/curves`, private key in OS secure store |
| Sharing | Signed JSON packs, written to cache and passed to the OS share sheet |

### Multi-tenancy

Every tenant-owned row carries `owner_id`. Every query filters on it. On a normal phone there is one
owner, but the column makes isolation explicit and lets one device hold several owners without
leaking rows between them.

A client device only ever holds what the owner explicitly shared. There is no shared database to
query, so one owner cannot see another owner's projects even in principle.

### Sharing protocol

A pack is a small JSON envelope:

```jsonc
{
  "v": 1,
  "id": "pck…",
  "kind": "project_share",        // invite | project_share | expense_submit | …
  "sender": { "id": "usr…", "name": "…", "publicKey": "64-hex" },
  "recipientId": "cli…",
  "createdAt": "2026-11-24T10:00:00.000Z",
  "payload": { … },
  "sig": "128-hex"                 // Ed25519 over canonical JSON
}
```

Rules enforced in `src/lib/pack.ts`:

1. The signature covers the canonical serialisation of every field, so editing any value (amount,
   recipient, decision) invalidates the pack.
2. A valid signature is not enough — the sender's public key must already be trusted. A stranger
   cannot forge "approved by owner".
3. Packs are content-addressed via a fingerprint, so importing the same file twice is a no-op.
4. The private key never appears in a pack.

Incoming packs land in the `message` table as **pending**. Nothing touches the books until the user
reviews and applies it.

## Project structure

```
src/
  app/                 routes (expo-router)
    (tabs)/            dashboard, clients, messages, settings
    project/[id].tsx   project detail + share
    onboarding/        first-run setup
  components/ui.tsx    small design system
  db/
    schema.ts          DDL + schema version
    index.ts           open, migrate, reset
    types.ts           row types + finance adapter
    queries.ts         typed, owner-scoped queries
  features/
    share-project.ts   build + sign + share a project update
  lib/
    finance.ts         financial rules (shared with web)
    crypto.ts          Ed25519, canonical JSON, hex
    pack.ts            share envelope, signing, verification
    payloads.ts        per-kind payload shapes
    money.ts           Indian number formatting
  state/
    identity.ts        key management via expo-secure-store
    hooks.ts           react-query hooks
```

## Commands

```bash
npx expo start                 # dev server
npx expo start --ios           # iOS simulator
npx expo start --android       # Android emulator
npm run typecheck              # tsc --noEmit
npm test                       # finance, money and pack unit tests
npx expo-doctor                # dependency/config health
npx expo export --platform ios # validate the production bundle
```

Native modules beyond Expo Go's set (secure-store, camera, sqlite plugins) require a development
build once: `npx expo run:ios` / `npx expo run:android`, or `eas build --profile development`.

## Test coverage

`npm test` covers the parts where a bug costs money:

- `finance.test.ts` — P&L, payables, client-paid vs client-borne, budget utilisation (11 tests)
- `money.test.ts` — Indian digit grouping, lakh/crore, parsing (5 tests)
- `pack.test.ts` — tamper detection, untrusted keys, re-addressing, idempotency (9 tests)

## Backup and recovery

There is no server, so an uninstall deletes every project unless a backup exists. Settings →
**Backup & restore** (also offered during onboarding) writes an encrypted `.sbbackup` file and hands
it to the OS share sheet.

| | |
|---|---|
| Encryption | AES-256-GCM |
| Key derivation | scrypt, N=16384, r=8, p=1, 32-byte key |
| Contents | every table, plus the device identity key |
| Where it goes | wherever the user sends the file — Drive, email, computer |
| Restore | replaces all local data, then restores the signing identity |

Because the file is encrypted with the user's passphrase, **a forgotten passphrase means the backup
cannot be opened by anyone**, including us. That is the trade-off for keeping the data unreadable to
cloud providers.

Restoring keeps the original public key, so existing client pairings continue to verify. Backups
from an older schema are migrated forward automatically on restore.

## Status

Feature parity with the web app's day-to-day workflow, plus the local-first sharing model:

**Owner**
- Onboarding, project create/delete, dashboard with portfolio totals and budget bars
- Income: create, edit, delete
- Expenses: create, edit, approve/reject, delete; labour-linked expenses use delta accounting
- Labour contracts: create, edit, delete, with committed/paid/due totals
- Materials: bills, payments, edit, delete; due is derived from payments
- Milestones: create, toggle completion
- Photos: pick from library, stored in the app document directory, preview and delete
- Reports: P&L, budget utilisation, spend by category, payables, export as PDF
- Activity timeline
- Pairing: QR or file invite, signed confirmation, per-client project sharing
- Messages: import files, full in/out history with failure reasons

**Client**
- Join by QR scan or invite file, then send a signed confirmation
- Read-only shared projects with budget, paid-to-date and shared expenses
- Submit expenses; see review status once the owner's decision is imported
- Import later project updates

**Deliberately out of scope**
- Project phases (schema exists; the UI treats projects as flat)
- Forecast projections beyond budget-vs-committed
- Cloud sync, accounts and remote backup — by design, there is no server
- Receipt OCR

## Shipping

```bash
npx eas-cli@latest build --profile preview      # internal build for TestFlight / APK
npx eas-cli@latest build --profile production   # store build
npx eas-cli@latest submit --profile production  # upload to App Store / Play
```

`eas.json` ships with development, preview and production profiles. Bundle identifiers are
`com.exploreinteriors.sitebooks` for both platforms.

For handing builds to real testers — costs, ad-hoc iOS vs TestFlight, Android APK, device
registration and the two-phone test script — see **[docs/DISTRIBUTION.md](docs/DISTRIBUTION.md)**.

## Test coverage

37 tests, all pure (no device required):

| File | Covers |
|---|---|
| `finance.test.ts` | P&L, payables, client-paid vs client-borne, budget utilisation (11) |
| `pack.test.ts` | tamper detection, untrusted keys, re-addressing, idempotency (9) |
| `money.test.ts` | Indian digit grouping, lakh/crore, parsing (5) |
| `dates.test.ts` | ISO/day-first parsing, impossible dates, inclusive ranges (4) |
| `base64.test.ts` | UTF-8 round-trip, known base64 vectors (4) |
| `statement-html.test.ts` | report totals, pending exclusion, HTML escaping, dues (4) |
