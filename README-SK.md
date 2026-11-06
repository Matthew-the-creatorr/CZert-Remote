# CZert Remote v3.0 — Android + web

Toto je **zdrojový projekt**, nie už skompilovaná APK. Verzia 2.7.1 bola použitá ako základ existujúceho Firebase párovania. Nové rozhranie a signalizácia pre WebRTC sú v `web/`. Natívny Android projekt je v koreňovom adresári repozitára.

## Čo bolo vytvorené

- Používateľ: tmavý diagnostický panel. V APK načítava skutočne dostupné údaje Androidu (RAM, batériu, teplotu batérie, približné úložisko, CPU jadrá). Presné využitie CPU, zdravie batérie a teplota CPU **nie sú** vydávané za skutočné merania, ak nie sú dostupné.
- Nastavenia: zobrazenie jednorazového kódu, prepínače povolenia prijímania žiadostí, reset párovania a vygenerovanie nového kódu. Reset na strane Používateľa zneplatní väzbu na starého administrátora vo Firestore.
- Administrátor: zadanie párovacieho kódu, schválené zariadenie, Kamera, Mikrofón, Obrazovka, Zastaviť a zadanie nového kódu.
- Kamera/mikrofón: návrh živého prenosu cez prehliadačové WebRTC; používateľ každú reláciu explicitne schváli a systém sa opýta na oprávnenie.
- Android obrazovka: zdrojový kód MediaProjection + WebRTC ScreenCapturerAndroid v natívnej službe s trvalým viditeľným oznámením a akciou ZASTAVIŤ. **Každá relácia** vyžaduje novú systémovú autorizáciu.
- Firestore: nové oddelené `streams` signalizačné dokumenty s pravidlami obmedzujúcimi prístup na aktuálne spárovanú dvojicu.

## 1. Pravidlá Firestore — nutné

V Firebase `NOXRemote` → Firestore → Rules skopíruj **celý** súbor `web/firestore.rules` a publikuj. Staré pravidlá v2.6 neobsahujú kolekciu `streams`, preto vzdialený prenos s nimi nebude fungovať. Nepoužívaj `allow read, write: if true`.

## 2. Web na Netlify — nutné

Na existujúcom projekte Netlify `prismatic-ganache-e69adc` nasadiť **celý priečinok** `web/`. Obsahuje `index.html`, `app.js`, `style.css`, `firebase-config.js`, `firestore.rules`, `manifest.webmanifest`.

Stránka je pevne nastavená v `MainActivity.java` na `https://prismatic-ganache-e69adc.netlify.app/`. Ak ju premenuješ, aktualizuj v zdroji `SITE` a `HOST` (a webové obmedzenia API kľúča).

**Nemeniť funkčný Firebase API kľúč naslepo.** Použitý je verejný webový kľúč z priloženej verzie 2.7.1.

## 3. Android Studio → APK

1. Otvor Android Studio a zvoľ **Open** → koreňový priečinok repozitára (obsahuje `settings.gradle`).
2. Uisti sa, že je nainštalovaný **Android SDK 35** a **JDK 17**.
3. Android Studio musí mať nainštalovaný Gradle 8.10.2. Ak chýba wrapper, použi Gradle nainštalovaný v systéme alebo GitHub Actions (nižšie).
4. Sync Gradle. Potom `Build → Build Bundle(s) / APK(s) → Build APK(s)`.
5. Výsledok býva `app/build/outputs/apk/debug/app-debug.apk`.

Závislosť WebRTC: `io.github.webrtc-sdk:android:150.7871.01` zo služby Maven Central. Na prvý build je potrebný internet pre sťahovanie Android SDK, Gradle a WebRTC knižnice.

## GitHub Actions — pohodlnejšia cesta k APK

Vytvor repozitár a vlož **obsah priečinka `android/` do koreňa repozitára** (nie samotný nadradený priečinok). Workflow v `.github/workflows/android-apk.yml` sa spustí po push na `main` alebo manuálne (`Actions → Build CZert Remote APK → Run workflow`). Po úspešnom behu stiahni artifact `CZert-Remote-v3.0-debug-apk`, rozbaľ a nájdeš `app-debug.apk`.

**Pozor:** Toto je návrh build workflow, ktorý tu nebolo možné vykonať; prípadné chyby kompilácie treba opraviť podľa GitHub Actions logu. GitHub debug APK nie je automaticky podpísaná publikovateľná release verzia.

## 4. Test na dvoch telefónoch

1. Používateľ: APK / Netlify → zvoľ Používateľ → kód.
2. Administrátor: web / APK → vlož celý kód → odoslať → Používateľ potvrdí.
3. Administrátor klikne Kamera/Mikrofón/Obrazovka.
4. Používateľ uvidí žiadosť. Ak prijíma žiadosti a schváli konkrétnu reláciu, Android/príslušný prehliadač vyžiada systémové oprávnenie.
5. Keď zdieľanie beží, Používateľ vidí výrazný indikátor a tlačidlo ZASTAVIŤ, natívne zdieľanie obrazovky má aj notifikáciu s okamžitým zastavením.
6. Reset párovania môže vykonať Používateľ v Nastaveniach, čím sa zneplatní staré schválenie a vygeneruje sa nový kód.

## Obmedzenia / technické riziká

- Zdroj Android časti **nebol v tomto prostredí kompilovaný do APK ani otestovaný na reálnom telefóne**: Android SDK tu chýba a stiahnutie nie je dostupné. Nesľubujeme, že sa spustí bez ďalšej korekcie závislostí/API.
- Kameru, mikrofón a živú obrazovku cez dva skutočné telefóny treba otestovať. V niektorých sieťach bez vlastného TURN servera WebRTC spojenie nebude fungovať.
- Natívny screen share funguje iba v Android APK, nie v Chrome na mobile.
- Zdieľanie z Androidu nie je možné automaticky znovu spustiť bez používateľovho súhlasu (Android 14+).
- Ak používateľ zavrie aplikáciu alebo zastaví reláciu, prenos má skončiť. Relácie nie sú neviditeľné.
- GitHub Releases a Netlify nasadenie nie sú automaticky vykonané týmto ZIP-om.

## Odkazy na dokumentáciu

- Android MediaProjection: https://developer.android.com/media/grow/media-projection
- Android foreground service types: https://developer.android.com/develop/background-work/services/fgs/service-types
- WebRTC Android library: https://github.com/webrtc-sdk/android
