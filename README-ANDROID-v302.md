# CZert Remote v3.0.2 — Android APK s lokálne zabaleným rozhraním

Táto verzia **už nenačítava UI zo starého Netlify**. Súbor `android/app/src/main/assets/index.html` obsahuje potrebné HTML, CSS, webovú Firebase konfiguráciu a aplikáciu v jednom dokumente. Obal Android WebView ho načítava pomocou `loadDataWithBaseURL` s HTTPS originom existujúcej stránky. Firebase SDK sa stále načítava z Google CDN a Firebase Auth + Firestore vyžadujú prístup na internet.

## Čo je kontrolované
- Android assets obsahuje klienta v3.0.2 (nie v2.7.1).
- JavaScript syntax a simulovaný dvojstranný pairing flow možno automaticky otestovať.
- Zdrojový kód Androidu používa tú istú verejnú Firebase konfiguráciu ako funkčná verzia v2.7.1.
- Žiadosť o pripojenie musí byť výslovne schválená na používateľskom zariadení.
- WebRTC prenos (kamera/mikrofón/obrazovka) vyžaduje ďalšie schválenie a možnosť okamžitého zastavenia.

## Pozor
Na živý prenos je potrebné publikovať nové `web/firestore.rules` z v3.0.2. Pôvodné pravidlá v2.7.1 povoľovali párovanie, **nie** kolekciu `streams`. APK nevie samo publikovať serverové bezpečnostné pravidlá.

Bez reálneho prístupu k dvom zariadeniam nie je možné potvrdiť živý WebRTC prenos ani Android systémové povolenia. Kompilácia a simulované testy nie sú to isté ako úspešná skúška na dvoch telefónoch.

## Automatický build
GitHub Actions → Build CZert Remote APK → v3.0.2-preview. V GitHub Releases je priamy súbor `CZert-Remote-v3.0.2.apk`. Debug APK slúži na testovanie; nie je to overená finálna verzia.
