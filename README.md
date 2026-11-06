# CZert Remote v3.0

Open-source Android + web project for a consent-based device diagnostics and live-sharing demonstration.

**Status: early test build.** Android compilation, real-device streaming and reliability are not yet verified. The repository does not contain an installed APK or a published release.

- Android source: `app/`
- Web app and Firebase settings: `web/`
- Android build workflow: `.github/workflows/android-apk.yml`
- Detailed Slovak setup and limitations: [README-SK.md](README-SK.md)

Screen, camera and microphone sharing require explicit consent on the participating device for each session, with visible indication and a stop control. Screen sharing uses Android MediaProjection; newer versions of Android require renewed system consent per screen-sharing session.

**Do not publish personal pairing codes or Firebase service-account keys.** The Firebase web client configuration is not a service-account secret; restrict its use and deploy strict Firestore rules before testing.
