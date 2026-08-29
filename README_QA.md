# AID QA / release gate

Filerna i detta paket läggs i repots rot med samma mappstruktur.

- `package.json`
- `tests/aid-golden.test.mjs`
- `.github/workflows/aid-qa.yml`
- `.github/workflows/pages.yml`

Testsviten innehåller:
- 24 kliniska golden cases med exakt förväntad åtgärdsordning
- 84 fulla matrisfall (4 pumpar × standard + två sMVC-faser × 7 mönster)
- säkerhetsinvarianter

För en verklig release-gate måste GitHub Pages efter uppladdningen ändras:
Settings → Pages → Build and deployment → Source → GitHub Actions.

Då kör `pages.yml` testerna först. Deployment körs endast om clinical-qa passerar.
