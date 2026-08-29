# AID QA och release-gate

Repositoryt har två GitHub Actions-workflows:

- `.github/workflows/aid-qa.yml` kör QA på pull requests mot `main`.
- `.github/workflows/pages.yml` kör QA på push till `main` och deployar till
  GitHub Pages endast när QA-jobbet har passerat.

Båda installerar låsta npm-beroenden med `npm ci` och kör `npm test`.

Testsviten innehåller:

- 24 kliniska golden cases med exakt förväntad åtgärdsordning
- 84 matrisfall (4 pumpar × standard + två sMVC-faser × 7 mönster)
- säkerhetsinvarianter

Pages-workflowen skapar en separat staging-katalog som endast innehåller
`index.html`. Repositoryts tester, konfiguration och dokumentation publiceras
inte i Pages-artifakten.

GitHub Pages måste vara konfigurerat med **Source: GitHub Actions** under
Settings → Pages → Build and deployment. Workflowens `clinical-qa`-jobb är en
release-gate: deploymentjobbet körs endast om testerna passerar.
