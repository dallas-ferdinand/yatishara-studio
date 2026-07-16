# Yatishara Studio for Android

Capacitor shell for the live Studio UI at
`https://studio.yatishara.com`. Web UI changes deploy normally; rebuild the
APK only when native plugins, permissions, icons, or Android code changes.

## Native mobile features

- Browser / PWA Web Push (VAPID) for Chrome installs and desktop
- Capacitor APK local notifications while Studio is open / process alive
  (no Firebase / FCM)
- Notification taps and Android App Links into the relevant Studio thread
- Android share sheet for original media files and links
- MediaStore saves to Pictures, Movies, Music, or Downloads
- Native haptics, connectivity status, and best-effort launcher badges
- Long-press support for the same context menus available by right-click

## Push without Firebase

| Surface | Delivery |
|--------|----------|
| Chrome / PWA / desktop browser | Real Web Push via VAPID |
| Capacitor APK, app open or backgrounded but alive | Local notification from Convex realtime |
| Capacitor APK, fully killed | No silent wake without FCM or a long-running service |

Generation still finishes on Convex. Keep the APK open (or leave it in
recents) if you want Android shade alerts without Firebase.

Browser Web Push env vars:

```text
WEB_PUSH_VAPID_PUBLIC_KEY
WEB_PUSH_VAPID_PRIVATE_KEY
NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY
WEB_PUSH_SUBJECT
```

## Build a sideload APK

```bash
npm install
npm run mobile:apk
```

Output:

```text
mobile/dist-apk/yatishara-studio-debug.apk
```

## App Links and release signing

`public/.well-known/assetlinks.json` currently contains the fingerprint for the
debug APK produced in the development environment. Before a production or Play
Store release:

1. Create and securely back up one permanent release keystore.
2. Build/sign the release APK or AAB with it.
3. Add its SHA-256 certificate fingerprint to `assetlinks.json`.
4. Keep the debug fingerprint if debug builds should continue opening links.

Get a fingerprint:

```bash
keytool -list -v -alias YOUR_ALIAS -keystore /secure/studio-release.jks \
  | grep SHA256
```

The custom link form `yatishara://studio/?path=/...` works without domain
verification; verified HTTPS App Links require the matching release fingerprint.
