# EndoTools

EndoTools är en statisk webbapplikation i `index.html` med automatiserade
kliniska regressionskontroller.

## Lokal testning

Krav: Node.js 22 och npm.

```sh
npm ci
npm test
```

## QA och release

Pull requests mot `main` kör testsviten via `AID clinical QA`. Pushar till
`main` kör samma QA i Pages-workflowen. Om QA passerar publiceras endast
`index.html` till GitHub Pages; vid testfel stoppas deploymenten.

Mer information om testomfattning och Pages-konfiguration finns i
[`README_QA.md`](README_QA.md).
