# Vietnamese i18n patcher for the Medusa Admin

Patches the Medusa Admin interface into Vietnamese **without touching Medusa
core** and without editing anything under `node_modules/`.

It writes through Medusa's documented extension point
(<https://docs.medusajs.com/learn/fundamentals/admin/translations>):

```
<backend>/src/admin/i18n/json/vi.json
<backend>/src/admin/i18n/index.ts
```

Medusa deep-merges those over its own translations at build time
(`deepMerge(coreTranslations, customResources)`), so keys defined here win and
everything else falls back to Medusa's defaults.

## Why

Medusa ships a **partial** Vietnamese file (`vi.json`). Everything missing from
it silently renders in English. This tool rebuilds a complete dictionary:

| source             | role                                 |
| ------------------ | ------------------------------------ |
| core `en.json`     | source of truth for the key set      |
| core `vi.json`     | Medusa's shipped Vietnamese          |
| `overrides/*.json` | our translations (merged last, wins) |

Result: **2425 / 2443** keys in Vietnamese, `0` missing. The ~18 remaining
identical values are legitimately language-neutral (`Email`, `JSON`, `S, M, L`,
`{{count}}` placeholders, `EAN`).

## Usage

```bash
# report coverage only (writes nothing)
node tools/admin-vi-i18n/patch-vi.mjs --admin-path /home/medusa --check

# write the Vietnamese dictionary into the Medusa project
node tools/admin-vi-i18n/patch-vi.mjs --admin-path /home/medusa

# write + rebuild the admin bundle + restart the backend
node tools/admin-vi-i18n/patch-vi.mjs --admin-path /home/medusa --build --restart

# machine-readable output
node tools/admin-vi-i18n/patch-vi.mjs --check --json
```

### Where the path comes from

`--admin-path` flag → `MEDUSA_ADMIN_PATH` env var → `config.json`.

```bash
cp tools/admin-vi-i18n/config.example.json tools/admin-vi-i18n/config.json
#  { "adminPath": "/home/medusa" }
```

`config.json` is git-ignored because it points at a machine-specific path.
`--admin-path` accepts either the Medusa root or its `apps/backend` workspace.

## Flags

| flag        | effect                                          |
| ----------- | ----------------------------------------------- |
| `--check`   | coverage + drift report, writes nothing         |
| `--dry-run` | build the output but do not write it            |
| `--build`   | run `yarn build` (`medusa build`) after writing |
| `--restart` | `pm2 restart medusa` after writing              |
| `--json`    | machine-readable report                         |
| `--quiet`   | summary line only                               |

## Editing translations

Add or override strings in `overrides/*.json`. Files merge in filename order,
later files win, so the numeric prefixes control precedence:

```
overrides/
  10-roles-permissions.json
  20-orders-promotions.json
  30-products-options-profile.json
  40-translations-search-pricelists-policies.json
  50-general-login-views-layout-campaigns-refunds-shipping.json
  60-misc-fields-auth-store-labels.json
```

Flat dotted keys are used for readability:

```json
{
  "roles.subtitle": "Quản lý các vai trò và quyền truy cập."
}
```

Re-running after a Medusa upgrade re-merges against the new `en.json`, so new
core keys show up as `still English` in `--check` until you translate them —
that is the intended upgrade workflow.

## After patching

1. `--build` regenerates `apps/backend/.medusa/server/public/admin/`.
2. `--restart` reloads the backend.
3. Language is chosen per browser: cookie `lng` → `localStorage.lng` → browser
   language. Vietnamese browsers pick `vi` automatically; anyone else sets it
   once under **Profile → Language** (persisted in `localStorage`).
