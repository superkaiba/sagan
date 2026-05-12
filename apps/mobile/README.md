# @sagan/mobile

Native iOS / Android companion to `sagan.superkaiba.com`. Built with
Expo SDK 54 + Expo Router.

## What it does today

- Login via the same `/api/auth/login` endpoint, with the session token
  stored in `expo-secure-store` and replayed as `Authorization: Bearer
  <token>` on every request (the web side accepts both cookies and
  Bearer tokens).
- **Today** tab — read the current day's research log entries.
- **Agent** tab — list recent agent runs; tap **Dispatch** to compose a
  new plan / apply / qa / experiment run; tap a run to watch its events
  stream and **Approve** / **Reject** plans on the phone.
- **You** tab — show the signed-in account and sign out.

## Local dev

```bash
cd apps/mobile
pnpm start            # Expo dev server (LAN)
pnpm ios              # native dev client (Mac + Xcode)
pnpm android          # native dev client (Android Studio)
```

`EXPO_PUBLIC_API_BASE` defaults to `https://sagan.superkaiba.com`.
For local web dev, set it to `http://YOUR_VM_IP:3100`.

## VM → phone preview

Three paths exist. Use whichever matches what your phone has installed.

### 1. OTA update (preview channel) — phone has a `preview` build

Every push to `main` runs `.github/workflows/eas-update.yml` and ships
the new JS bundle to the `preview` channel. Reopen Sagan on the phone;
it pulls the update on next launch. To trigger manually:

```bash
gh workflow run eas-update.yml
```

### 2. Fresh standalone build — no build on phone, or you changed native code

Trigger `.github/workflows/mobile-build.yml` from the Actions tab (or
`gh workflow run mobile-build.yml -f platform=ios -f profile=preview`).
The run posts an install QR to the Actions Summary **and** publishes to
[`sagan.superkaiba.com/install`](https://sagan.superkaiba.com/install).
Open that page on the phone and tap **Install**. The `profile` input
accepts `preview` (standalone, OTA-updateable) or `development` (dev
client, required for path 3).

### 3. Live tunnel (HMR) — phone has a `development` build

```bash
pnpm tunnel           # Expo dev server with --tunnel --dev-client
```

Requires either:

- **`NGROK_AUTHTOKEN`** in your shell env (sign up at ngrok.com → grab
  token). The Expo CLI uses it to spin up a public tunnel. Recommended.
- **OR** firewall-open `8081` on the VM and use the direct-IP path:
  ```bash
  REACT_NATIVE_PACKAGER_HOSTNAME=35.226.138.62 pnpm start --host lan --port 8081
  ```
  In the dev client, open the dev menu → **Configure URL** → enter
  `http://35.226.138.62:8081`.

If you don't have a `development` build yet, run the build workflow
with `profile=development` once (path 2) to install the dev client.

## Production build (EAS)

```bash
eas login            # one-time
eas build --profile preview --platform ios
eas build --profile preview --platform android
eas update --branch preview   # OTA-push JS-only changes
```

Push notifications use Expo Notifications (`expo-notifications`); a
device push token is registered at the API once login completes (TODO:
wire to the runner's `awaiting_approval` event).

## Why no separate web build?

The dashboard already ships a PWA at `dashboard.superkaiba.com/manifest.webmanifest`.
The Expo web target is configured but not deployed; install the PWA for
desktop-like experience without a second build pipeline.
