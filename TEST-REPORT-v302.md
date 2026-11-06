# CZert Remote v3.0.2 — záznam kontroly

- JavaScript `node --check`: úspešné.
- Chromium/Playwright dva simulované klienty: 8/8 prešlo (generovanie kódu, odoslanie, prijatie, schválenie, potvrdenie, reset, zobrazenie verzie, izolácia chyby médií).
- `android/app/src/main/assets/index.html`: obsahuje CSS, Firebase konfig a JS modul v3.0.2.
- **Nie je overený produkčný Firebase ani skutočné pripojenie dvoch Android telefónov.**
- Pre živý prenos treba mať v Firebase publikované pravidlá z `web/firestore.rules`. Staré pravidlá blokujú `streams`.
- APK je založené na Android WebView `loadDataWithBaseURL` so známym HTTPS originom stránky. Prenos vyžaduje výslovné povolenie a indikátor.
