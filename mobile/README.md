# Yatishara Studio for Android

Capacitor shell for the live Studio UI at
`https://studio.yatishara.com`. Web UI changes deploy normally; rebuild the
APK only when native plugins, permissions, icons, or Android code changes.

## Native mobile features

- FCM push notifications for generation and billing updates
- Notification taps and Android App Links into the relevant Studio thread
- Ongoing local generation-progress notifications (no long-running phone work)
- Android share sheet for original media files and links
- MediaStore saves to Pictures, Movies, Music, or Downloads
- Native haptics, connectivity status, and best-effort launcher badges
- Long-press support for the same context menus available by right-click

Generation remains server-side. The app does not hold an Android foreground
service open just to poll jobs; Android restricts that pattern and Google Play
may reject it. Convex finishes work and FCM delivers completion/failure.

## Firebase setup (required for killed-app push)

The server and notification UX are ours, but stock Android uses a system push
transport to wake a killed app. On Google-enabled phones that transport is
Firebase Cloud Messaging. A self-hosted permanent socket would be throttled by
Doze and would waste battery.

1. Create/select a Firebase project.
2. Add Android app package `com.yatishara.studio`.
3. Download `google-services.json` to
   `mobile/android/app/google-services.json` (gitignored).
4. Create a Firebase service account with FCM send access.
5. Put its JSON in the Convex environment as raw or base64:

   ```bash
   npx convex env set FIREBASE_SERVICE_ACCOUNT_JSON \
     "$(base64 -w0 /secure/firebase-service-account.json)"
   ```

Never put the service-account JSON in the APK or a `NEXT_PUBLIC_*` variable.

Browser installs continue to use the existing VAPID Web Push variables:

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
