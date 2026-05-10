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
pnpm start            # Expo dev server (tunnel ON by default)
# Scan the QR with Expo Go on your phone, or:
pnpm ios              # native dev client (Mac + Xcode)
pnpm android          # native dev client (Android Studio)
```

`EXPO_PUBLIC_API_BASE` defaults to `https://sagan.superkaiba.com`.
For local web dev, set it to `http://YOUR_VM_IP:3100`.

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
