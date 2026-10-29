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

Medusa already ships Vietnamese, but only **part of it**: core `vi.json` holds
**1962 of 2443** keys, so **498 strings silently render in English** — the login
screen alone has 15 keys and only 3 are translated (every MFA string is
English). This tool rebuilds the missing part:

| source             | role                                 |
| ------------------ | ------------------------------------ |
| core `en.json`     | source of truth for the key set      |
| core `vi.json`     | Medusa's shipped Vietnamese          |
| `overrides/*.json` | our translations (merged last, wins) |

Result: **2425 / 2443** keys in Vietnamese, `0` missing — 15/15 on the login
screen. The ~18 remaining identical values are legitimately language-neutral
(`Email`, `JSON`, `S, M, L`, `{{count}}` placeholders, `EAN`).

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
| `--no-labels`     | keep Medusa's stock order-payment row values    |
| `--json`          | machine-readable report                         |
| `--quiet`         | summary line only                               |

## Default language

Medusa ships:

```js
detection: {
  order: ["cookie", "localStorage", "header"],
  lookupCookie: "lng",
  lookupLocalStorage: "lng",
},
fallbackLng: "en",
```

Three problems follow:

1. `i18next-browser-languagedetector` registers no `header` lookup, so a browser
   with nothing stored detects nothing and i18next falls back to
   `fallbackLng: "en"` — the Admin opened in English for everyone, whatever the
   browser language was.
2. `caches` **was** valid, so that wrong `"en"` was written back to the browser
   on every visit. Any browser that opened the Admin before this tool ran
   therefore carries `lng=en`, which would keep beating a new default.
3. The dead `header` entries misdescribe the config.

The tool rewrites that to:

```js
detection: {
  order: ["cookie", "localStorage"],
  lookupCookie: "medusa_admin_lng",
  lookupLocalStorage: "medusa_admin_lng",
},
fallbackLng: ["vi", "en"],
```

so:

- **every screen opens in Vietnamese** — the login form, the MFA step and the
  whole authenticated app share a single i18next instance, so there is nothing
  to patch per screen;
- a browser that visited before this ran gets Vietnamese too: its stale `lng=en`
  is never read, because the storage key was renamed;
- an explicit **Profile → Language** choice is written to and read from the new
  key, so switching language still works;
- English remains the fallback, so a key added by a future Medusa release
  renders in English instead of showing its raw dotted name.

Nothing else in the dashboard reads `lng` — the lookup key belongs to the
detector alone (verified against the package source).

It touches `node_modules/@medusajs/dashboard/dist/*` (the bundle input) and
`src/i18n/config.ts`, matches at most once per pattern, and is re-applied by a
plain re-run — so run this tool again after any `yarn install` or Medusa
upgrade. `--check` reports the state; `test-runtime.cjs` asserts it.

## Payment row labels

The **Order → Payments** rows render raw machine values — none of them is an
i18n key, so the dictionary cannot reach them. Medusa ships:

| rendered                 | source in the dashboard bundle                      |
| ------------------------ | --------------------------------------------------- |
| `#5R7ZEDV`               | last 7 chars of the **payment** id, not the order   |
| `30 Oct, 2026, 03:44:51` | `format(date, "dd MMM, yyyy, HH:mm:ss")`            |
| `pp_sepay`               | `payment.provider_id`, only CSS-`capitalize`d       |
| `pp_system_default`      | same                                                |
| `Captured` / `Pending`   | hard-coded English status labels                    |

The tool rewrites those expressions in place (`--no-labels` skips it):

| now renders          | how                                                                 |
| -------------------- | ------------------------------------------------------------------- |
| `#9`                 | `order.display_id`, falling back to the payment-id hash             |
| `30/10/2026 03:44`   | `"dd/MM/yyyy HH:mm"`                                                |
| `SePay`              | map `pp_sepay → "SePay"`                                            |
| `Xác nhận thủ công`  | map `pp_system_default → "Xác nhận thủ công"`                       |
| `Đã thu tiền` / `Chờ xử lý` / `Đã hủy` | Vietnamese status labels                           |

Unknown providers still get a readable fallback (strip the `pp_` prefix and
underscores). It edits the same shipped files as the language default —
`order-detail-*.mjs`, `order-create-refund-*.mjs` and `app.js` today — is
idempotent, and reports `already applied` on a re-run. If a future Medusa build
moves the markup, `--check` reports `payment rows not recognised` instead of
silently doing nothing.

## Testing

```bash
node tools/admin-vi-i18n/test-runtime.cjs            # uses config.json/env path
node tools/admin-vi-i18n/test-runtime.cjs --admin-path /home/medusa
```

Reproduces the Admin's real runtime (`i18next` +
`i18next-browser-languagedetector`, options read **live** from the installed
dashboard package) and asserts: dictionary coverage, plurals, interpolation, the
documented fallback chain, the shipped defaults, the language a fresh visit gets,
the login screen (including the MFA step missing from stock `vi.json`), that a
browser carrying the old auto-written `lng=en` still lands on Vietnamese, and
that an explicit Profile → Language choice still wins — 29 assertions in total.
Exit code `0` means all of them passed; when no Medusa checkout is present (as
in CI) it skips with exit `0`.

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
