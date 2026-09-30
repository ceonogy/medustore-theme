# Vietnamese i18n patcher for the Medusa Admin

Patches the Medusa Admin interface into Vietnamese **without modifying Medusa
core sources**, and makes Vietnamese its default language.

The translation half writes through Medusa's documented extension point
(<https://docs.medusajs.com/learn/fundamentals/admin/translations>):

```
<backend>/src/admin/i18n/json/vi.json
<backend>/src/admin/i18n/index.ts
```

Medusa deep-merges those over its own translations at build time
(`deepMerge(coreTranslations, customResources)`), so keys defined here win and
everything else falls back to Medusa's defaults.

The default-language half edits two shipped files inside
`node_modules/@medusajs/dashboard/` (see [Default language](#default-language));
pass `--no-default-vi` to skip it.

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

| flag              | effect                                          |
| ----------------- | ----------------------------------------------- |
| `--check`         | coverage + drift report, writes nothing         |
| `--dry-run`       | build the output but do not write it            |
| `--build`         | run `yarn build` (`medusa build`) after writing |
| `--restart`       | `pm2 restart medusa` after writing              |
| `--no-default-vi` | keep Medusa's stock language default            |
| `--json`          | machine-readable report                         |
| `--quiet`         | summary line only                               |

## Default language

Medusa ships:

```js
detection: { order: ["cookie", "localStorage", "header"] },
fallbackLng: "en",
```

`i18next-browser-languagedetector` registers no `header` lookup, so a browser
with no stored language detects nothing and i18next falls back to `fallbackLng`
— the Admin therefore opened in English for everyone, whatever the browser
language was.

The tool rewrites that to:

```js
detection: { order: ["cookie", "localStorage"] },
fallbackLng: ["vi", "en"],
```

so:

- a fresh session opens in **Vietnamese**;
- an explicit **Profile → Language** choice is cached in the cookie /
  `localStorage` lookups and still wins;
- English remains the fallback, so a key added by a future Medusa release
  renders in English instead of showing its raw dotted name.

It only touches `node_modules/@medusajs/dashboard/dist/*` (the bundle input) and
`src/i18n/config.ts`, matches at most once per file, and is re-applied by a
plain re-run — so run this tool again after any `yarn install` or Medusa
upgrade. `--check` reports the state; `test-runtime.cjs` asserts it.

## Testing

```bash
node tools/admin-vi-i18n/test-runtime.cjs            # uses config.json/env path
node tools/admin-vi-i18n/test-runtime.cjs --admin-path /home/medusa
```

Reproduces the Admin's real runtime (`i18next` +
`i18next-browser-languagedetector`, options read live from the installed
dashboard package) and asserts: dictionary coverage, plurals, interpolation,
the documented fallback chain, the shipped defaults, and the language a fresh
visit gets. Exit code `0` means all assertions passed.

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
3. The Admin now opens in Vietnamese. A different language is picked once under
   **Profile → Language** — the list is sorted by display name, so Vietnamese
   appears as **"Tiếng Việt"** (between _Swedish_ and _Türkçe_) — and that
   choice is remembered in the cookie / `localStorage` for that browser.
4. Hard-refresh (`Ctrl/Cmd + Shift + R`) after a rebuild: `index.html` is served
   `no-cache`, but the browser may still hold the previous bundle.
