# A.SPEC 0001 — Make Greenter adapter live inside the repo

> `risk: normal` — Adds a new isolated PHP service boundary and dependency lock, but does not change existing runtime behavior, database schema, frontend routes, or Systutor core.

## WHY

Librefact will use Greenter as the electronic invoicing engine for Peru. Before connecting backend flows or SUNAT, the project needs Greenter to exist inside the repository as an explicit, testable service boundary.

Without this step, later specs would mix multiple truths at once: dependency installation, PHP service structure, backend contract, SUNAT emission, XML/CDR persistence, and UI behavior.

## WHAT

Create a dedicated PHP Composer project at `services/greenter-adapter` that declares and locks `greenter/greenter`, provides a minimal test suite, and proves Greenter is autoloadable from inside the repo.

New independent falsable truth:

```text
From a fresh checkout with PHP/Composer available, `services/greenter-adapter` can install dependencies and prove `Greenter\See` is autoloadable through Composer.
```

## SCOPE

- Create `services/greenter-adapter/`.
- Create a Composer package for the adapter.
- Require `greenter/greenter`.
- Commit `composer.json` and `composer.lock`.
- Add PHPUnit as the local test runner for the adapter.
- Add a first failing test before implementation that proves Greenter is not yet available.
- Make the test pass by installing and wiring the dependency.
- Add a minimal adapter README explaining local install/test commands.

## OUT OF SCOPE

- No SUNAT beta or production calls.
- No XML generation.
- No certificate handling.
- No CDR processing.
- No backend Python integration.
- No HTTP endpoint yet.
- No database migrations.
- No dashboard UI.
- No inventory, sales, stock, purchases, or cash module work.

## CONTRACT

Preconditions:

- The repo has the Librefact base project.
- PHP `>= 7.4` and Composer are available in the environment running this spec.
- `ADD/` exists locally and this A.SPEC is executed under ADD discipline.

Postconditions:

- `services/greenter-adapter/composer.json` exists.
- `services/greenter-adapter/composer.lock` exists.
- Composer dependency `greenter/greenter` is locked.
- `services/greenter-adapter/vendor/autoload.php` is generated after `composer install`.
- A PHPUnit test proves `class_exists(Greenter\See::class)`.
- Existing frontend/backend/database scripts still behave as before.

## INVARIANTS

```yaml
invariants:
  - id: root-npm-scripts-preserved
    statement: Root `package.json` scripts `frontend`, `services`, `db`, `dev`, and `typecheck` remain present.
    proof: `node -e 'const p=require("./package.json"); for (const k of ["frontend","services","db","dev","typecheck"]) if (!p.scripts?.[k]) process.exit(1)'`
  - id: librefact-db-script-preserved
    statement: `scripts/systutor-db.sh` remains syntactically valid and still targets the `librefact` DB by default.
    proof: `bash -n scripts/systutor-db.sh && grep -q 'localhost:5432/librefact' scripts/systutor-db.sh`
  - id: frontend-typecheck-preserved
    statement: Existing dashboard typecheck still passes.
    proof: `npm run typecheck`
```

## VERIFICATION

Test-first sequence:

1. Create the adapter test first at `services/greenter-adapter/tests/GreenterDependencyTest.php`.
2. Run the test before requiring Greenter and observe failure.
3. Require/install `greenter/greenter`.
4. Run the test again and observe pass.

Required checks:

```bash
test -f services/greenter-adapter/composer.json
test -f services/greenter-adapter/composer.lock
composer validate --strict --working-dir services/greenter-adapter
composer show --working-dir services/greenter-adapter greenter/greenter
composer test --working-dir services/greenter-adapter
php -r 'require "services/greenter-adapter/vendor/autoload.php"; exit(class_exists("Greenter\\See") ? 0 : 1);'
node -e 'const p=require("./package.json"); for (const k of ["frontend","services","db","dev","typecheck"]) if (!p.scripts?.[k]) process.exit(1)'
bash -n scripts/systutor-db.sh
grep -q 'localhost:5432/librefact' scripts/systutor-db.sh
npm run typecheck
```

## ROLLBACK

This change is reversible.

Rollback steps:

```bash
rm -rf services/greenter-adapter
```

No database rollback is required because this A.SPEC must not create migrations or mutate persistent data.

## Change Surface

```yaml
change_surface:
  allowed:
    - A-SPECS/0001-greenter-adapter-in-repo.md
    - services/greenter-adapter/**
  prohibited:
    - vendor/systutor-core/**
    - apps/web/**
    - scripts/systutor-db.sh
    - package.json
    - docs/architecture.md
    - database schema or migrations
```

## Blast Radius

```yaml
blast_radius:
  direct:
    - New PHP Composer service directory
    - Local Composer dependency installation under services/greenter-adapter
  indirect:
    - Developer environment now needs PHP/Composer to work on Greenter adapter specs
  must_not_affect:
    - Existing Systutor backend
    - Existing dashboard frontend
    - Existing PostgreSQL librefact DB script
    - Existing root npm scripts
```

## Composition

```yaml
composition:
  requires_aspecs: []
  must_compose_with:
    - docs/architecture.md
  systemic_invariants:
    - Greenter remains isolated behind `services/greenter-adapter` until a later integration A.SPEC defines the backend contract.
    - No SUNAT behavior is claimed by this A.SPEC.
  composition_checks:
    - `test -f docs/architecture.md`
    - `grep -q 'Greenter Adapter' docs/architecture.md`
```

## Structural Constraints

```yaml
structural_constraints:
  primary_rule: one coherent responsibility and one main reason to change
  entrypoints_must_stay_thin: true
  review_threshold_lines: 400
  extraction_threshold_lines: 600
  preferred_new_logic_locations:
    - services/greenter-adapter/src
    - services/greenter-adapter/tests
```

## Traceability

- Requirement: Librefact Spec 0.1 must make Greenter live inside the repo as a testable adapter foundation.
- owner: Lucas
- approver: Lucas
- Commit: 54d8de93e764965aace6c35048ed3a877670af3c
- Deployment: local repository only; no runtime deployment in this A.SPEC.

## Definition of Done

- [ ] Objective satisfied
- [ ] Scope respected
- [ ] Contract satisfied
- [ ] Independent falsable truth exists now
- [ ] Invariants preserved
- [ ] Verification passed
- [ ] Rollback / compensation is honest
- [ ] Composition checks passed when applicable
- [ ] No unrelated changes
- [ ] Structural constraints respected
- [ ] Traceability established
