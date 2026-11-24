# Distributing test builds

Testers need a real installable app. **Expo Go is not suitable** — it cannot open `sitebooks://`
links, cannot be installed from the home screen, and shows an Expo splash.

Builds are produced in the cloud with **Expo Build (EAS)**, so no Mac or Android Studio is required.

## What it costs

| Item | Price | Notes |
|---|---|---|
| Expo Build (EAS) Free | **$0** | 15 Android + 15 iOS builds per month, low-priority queue, 45 min timeout |
| Apple Developer Program | **~₹8,900 / year** | Mandatory for installing on anyone else's iPhone |
| Google Play Console | **~₹2,200 one-time** | Only if you want Play Store testing tracks; not needed for a direct APK |
| Domain / hosting | $0 | The app has no backend |

There is **no free way to install on other people's iPhones**. Apple requires the paid developer
program for both TestFlight and ad-hoc distribution.

## Prerequisites

1. An Expo account — sign up at <https://expo.dev>, then:
   ```bash
   npx eas-cli@latest login
   npx eas-cli@latest init      # links the project, writes extra.eas.projectId
   ```
2. For iOS: enrol in the Apple Developer Program as an **organization** (needs a D-U-N-S number) or
   as an **individual** (faster). Individual is fine for testing.

---

## Android — fastest, free

Android can be distributed as a plain APK with no store account.

```bash
npx eas-cli@latest build --profile preview --platform android
```

When it finishes you get a URL like `https://expo.dev/artifacts/eas/xxxx.apk`. Send that link to
testers. They open it on the phone, allow "install unknown apps" for their browser, and install.

- No store review, no fees.
- Works on any Android phone (min SDK from Expo defaults, Android 7+).
- Updates require sending a new APK.

## iOS — needs the Apple Developer Program

Two options. For a handful of testers, **ad hoc** is quicker because it skips review.

### Option A — Ad hoc (up to 100 devices)

1. Register tester devices. This prints a link testers open once to register their UDID:
   ```bash
   npx eas-cli@latest device:create
   ```
2. Build:
   ```bash
   npx eas-cli@latest build --profile preview --platform ios
   ```
3. Send testers the install link from the build page.

Device limits reset only once per membership year, so test with a small group first.

### Option B — TestFlight (up to 10,000 testers)

1. Create the app record in **App Store Connect** (bundle id `com.exploreinteriors.sitebooks`).
2. Build and submit:
   ```bash
   npx eas-cli@latest build --profile production --platform ios
   npx eas-cli@latest submit --profile production --platform ios
   ```
3. In App Store Connect → TestFlight:
   - **Internal testers** (up to 100, must be users in your account) — no review needed.
   - **External testers** (public link, up to 10,000) — requires a short Beta App Review, usually
     1–2 days.

TestFlight builds expire after **90 days**.

---

## Google Play (optional)

Only needed if you want Play Store testing tracks instead of an APK.

```bash
npx eas-cli@latest build --profile production --platform android
npx eas-cli@latest submit --profile production --platform android
```

Then create an **Internal testing** release in the Play Console and add tester emails.

---

## What testers experience

1. Install the app (APK link or TestFlight invite).
2. First launch asks: **"I'm a designer"** or **"I'm a client"**.
   - Designers create a workspace immediately.
   - Clients must receive an invite from a designer first.
3. Everything is stored on their phone. Nothing is uploaded.
4. Testers should be told to create a backup early — Settings → Backup & restore.

### Testing the owner ↔ client exchange

It needs **two devices**, because the client's confirmation must come from a different key:

1. Phone A: designer setup → Clients → add client → **Show QR**
2. Phone B: "I'm a client" → **Scan QR** → send confirmation file
3. Phone A: Messages → **Import a file** → pick the confirmation
4. Phone A: open a project → **Share project update**
5. Phone B: **Import shared update** → project appears → submit an expense
6. Phone A: Messages → import → approve

If a tester only has one phone, they can test one side at a time using
**Settings → Reset this device**.

---

## Before you share builds

- **Replace the app icon and splash.** `assets/icon.png` is still the Expo template logo.
- Confirm the display name is `SiteBooks` (it is, in `app.json`).
- Decide on the bundle identifier now: `com.exploreinteriors.sitebooks`. Changing it after release
  creates a different app and loses TestFlight history.

## Updating testers later

- New native build: rebuild and resend the link (Android) or upload to TestFlight.
- JS-only changes could use Expo Update, but the app currently has no `updates` config — add it with
  `npx eas-cli@latest update:configure` if you want over-the-air fixes.

## Security notes

- The repository is public, but contains **no secrets**: no `.env`, no API keys, no data.
- Test builds carry a real copy of company data only if you restore a seed backup onto them. Treat
  test devices accordingly, and delete seed files after use.
- Each device generates its own signing identity on first run; nothing is shared between tenants.
