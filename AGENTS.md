# EndoTools repository instructions

## Release workflow

- Start every task from the latest `main` and create a `codex/<task>` branch.
- Make the smallest possible diff for the requested change.
- Do not change clinical content unless the task explicitly requests it or a reproducible QA failure demonstrates that it is necessary.
- Update clinical golden cases and exact behavior regression expectations only for intentional behavior changes.
- Run `npm ci`, `npm test`, and `git diff --check` before committing.
- Commit and push the task branch, then open a pull request against `main`.
- Verify GitHub Actions and merge only when all required QA is green.
- After merge, verify the `main` deployment and the published site.

## AID safeguards

- Keep standard and sMVC behavior isolated.
- Keep pump-specific logic and terminology isolated between Omnipod, Tandem, Medtronic, and CamAPS.
- When the DOM changes, update the test harness to reflect the intentional structure instead of weakening tests.

## Handoff report

Always report the branch, commit SHA, changed files, QA results, pull request, merge result, and deployment result.
