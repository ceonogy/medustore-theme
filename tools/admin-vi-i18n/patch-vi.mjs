#!/usr/bin/env node
/**
 * patch-vi.mjs — Vietnamese i18n patcher for the Medusa Admin.
 *
 * Medusa ships a partial Vietnamese translation. This tool rebuilds a *complete*
 * Vietnamese dictionary and writes it through Medusa's official, documented
 * extension point:
 *
 *     <backend>/src/admin/i18n/json/vi.json
 *     <backend>/src/admin/i18n/index.ts
 *
 * Medusa merges those over the core translations at build time
 * (deepMerge(coreTranslations, customResources)), so no core source file is
 * edited. Re-running after a Medusa upgrade re-syncs the dictionary against the
 * new English source of truth.
 *
 * Merge order (later wins):
 *   1. core en.json        — the full key set (source of truth for keys)
 *   2. core vi.json        — Medusa's shipped Vietnamese
 *   3. overrides/*.json    — our translations (sorted by filename)
 *
 * It also makes Vietnamese the Admin's *default* language (see
 * "Default language" below); pass --no-default-vi to keep Medusa's stock
 * behaviour.
 *
 * Usage:
 *   node tools/admin-vi-i18n/patch-vi.mjs --admin-path /home/medusa
 *   node tools/admin-vi-i18n/patch-vi.mjs --check
 *   node tools/admin-vi-i18n/patch-vi.mjs --build --restart
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const OVERRIDES_DIR = path.join(TOOL_DIR, "overrides");

const args = process.argv.slice(2);

function readFlag(name, short) {
  const idx = args.findIndex(
    (a) => a === `--${name}` || (short && a === `-${short}`),
  );
  if (idx === -1) return undefined;
  const value = args[idx + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`Flag --${name} requires a value`);
  }
  return value;
}

const flags = {
  check: args.includes("--check"),
  dryRun: args.includes("--dry-run"),
  build: args.includes("--build"),
  restart: args.includes("--restart"),
  json: args.includes("--json"),
  quiet: args.includes("--quiet"),
  noDefaultVi: args.includes("--no-default-vi"),
  help: args.includes("--help") || args.includes("-h"),
};

if (flags.help) {
  console.log(`Vietnamese i18n patcher for the Medusa Admin

Usage:
  node tools/admin-vi-i18n/patch-vi.mjs [options]

Options:
  --admin-path <dir>  Medusa project root (or its apps/backend).
                      Order: flag > MEDUSA_ADMIN_PATH env > config.json
  --check             Report coverage and drift only; write nothing
  --dry-run           Build the output but do not write it
  --build             Run \`yarn build\` (medusa build) after writing
  --restart           pm2 restart medusa after writing
  --no-default-vi     Keep Medusa's stock language default instead of
                      making Vietnamese the Admin's default language
  --json              Emit machine-readable JSON
  --quiet             Only print the summary line
  -h, --help          Show this help
`);
  process.exit(0);
}

const log = (...m) => {
  if (!flags.quiet && !flags.json) console.log(...m);
};

// ---------------------------------------------------------------- utilities

const isPlainObject = (v) =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function deepMerge(base, patch) {
  const out = { ...base };
  for (const [key, value] of Object.entries(patch ?? {})) {
    out[key] =
      isPlainObject(value) && isPlainObject(out[key])
        ? deepMerge(out[key], value)
        : value;
  }
  return out;
}

function flatten(obj, prefix = "", out = {}) {
  for (const [key, value] of Object.entries(obj)) {
    const dotted = prefix ? `${prefix}.${key}` : key;
    if (isPlainObject(value)) {
      flatten(value, dotted, out);
    } else {
      out[dotted] = value;
    }
  }
  return out;
}

function unflatten(flat) {
  const out = {};
  for (const [dotted, value] of Object.entries(flat)) {
    const parts = dotted.split(".");
    let node = out;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const part = parts[i];
      if (!isPlainObject(node[part])) node[part] = {};
      node = node[part];
    }
    node[parts[parts.length - 1]] = value;
  }
  return out;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

// ------------------------------------------------------------- path resolution

function resolveAdminPath() {
  const fromFlag = readFlag("admin-path", "a");
  const fromEnv = process.env.MEDUSA_ADMIN_PATH;
  const configFile = path.join(TOOL_DIR, "config.json");
  const fromFile = fs.existsSync(configFile)
    ? readJson(configFile).adminPath
    : undefined;

  const adminPath = fromFlag ?? fromEnv ?? fromFile;
  if (!adminPath) {
    throw new Error(
      [
        "No Medusa admin path configured.",
        "Pass --admin-path <dir>, set MEDUSA_ADMIN_PATH, or create",
        `  ${path.relative(process.cwd(), configFile)}`,
        '  { "adminPath": "/home/medusa" }',
      ].join("\n"),
    );
  }
  const resolved = path.resolve(adminPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Admin path does not exist: ${resolved}`);
  }
  return resolved;
}

/** Accepts either the Medusa root or its apps/backend workspace. */
function resolveLayout(adminPath) {
  const nested = path.join(adminPath, "apps", "backend");
  const backendDir = fs.existsSync(nested) ? nested : adminPath;
  const medusaRoot =
    backendDir === adminPath
      ? adminPath
      : path.dirname(path.dirname(backendDir));
  return { medusaRoot, backendDir };
}

function findCoreTranslations(medusaRoot, backendDir) {
  const candidates = [
    ...new Set([
      path.join(
        medusaRoot,
        "node_modules",
        "@medusajs",
        "dashboard",
        "src",
        "i18n",
        "translations",
      ),
      path.join(
        backendDir,
        "node_modules",
        "@medusajs",
        "dashboard",
        "src",
        "i18n",
        "translations",
      ),
      path.join(medusaRoot, "node_modules", ".store", "dashboard"), // pnpm store layout
    ]),
  ];

  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "en.json"))) return dir;
    if (fs.existsSync(dir)) {
      // pnpm/yarn unplugged layouts keep the package one level deeper
      const nested = findNested(dir);
      if (nested) return nested;
    }
  }

  throw new Error(
    [
      "Could not locate @medusajs/dashboard translations.",
      "Looked in:",
      ...candidates.map((c) => `  ${c}`),
      "Run this from the machine where the Medusa dependencies are installed,",
      "or pass --admin-path pointing at the Medusa project root.",
    ].join("\n"),
  );
}

function findNested(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(dir, entry.name);
    if (fs.existsSync(path.join(candidate, "en.json"))) return candidate;
    const pkg = path.join(candidate, "package.json");
    if (fs.existsSync(pkg)) {
      try {
        if (readJson(pkg).name === "@medusajs/dashboard") {
          const src = path.join(candidate, "src", "i18n", "translations");
          if (fs.existsSync(path.join(src, "en.json"))) return src;
        }
      } catch {
        /* ignore malformed package.json */
      }
    }
  }
  return null;
}

function loadOverrides() {
  if (!fs.existsSync(OVERRIDES_DIR)) return { files: [], merged: {} };
  const files = fs
    .readdirSync(OVERRIDES_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b));

  let merged = {};
  for (const file of files) {
    const data = readJson(path.join(OVERRIDES_DIR, file));
    if (!isPlainObject(data)) {
      throw new Error(`Override must be a JSON object: ${file}`);
    }
    merged = deepMerge(merged, data);
  }
  return { files, merged };
}

// ------------------------------------------------- Vietnamese as the default
//
// Medusa ships:
//
//     detection: { caches: [..., "header"], order: [..., "header"],
//                  lookupCookie: "lng", lookupLocalStorage: "lng" },
//     fallbackLng: "en"
//
// That produces three problems, fixed here in order:
//
//  1. i18next-browser-languagedetector registers no "header" lookup, so a
//     browser with nothing stored detects nothing and i18next falls back to
//     `fallbackLng: "en"` — every fresh session opened in English.
//     -> fallbackLng becomes ["vi", "en"]: Vietnamese first (the Admin's
//        default), English second, so a key added by a future Medusa release
//        still renders instead of showing its raw dotted name.
//
//  2. `caches` was valid even though detection was not, so that wrong "en" was
//     written back to the browser on every visit. Browsers that opened the
//     Admin before this tool ran therefore carry `lng=en` and would keep
//     showing English — the stored value would beat the new default.
//     -> the storage key is renamed to `medusa_admin_lng`. The stale value is
//        simply never read; a language chosen afterwards under Profile →
//        Language is written to and read from the new key, so switching still
//        works. Nothing else in the dashboard reads `lng` (verified).
//
//  3. The dead "header" entries are dropped, so the config says what it does.
//
// This touches only shipped @medusajs/dashboard package files — the same
// package the core translations are read from — matches at most once per
// pattern, and a plain re-run after `yarn install` re-applies everything.
// Pass --no-default-vi to skip this step entirely.

/** Where the Admin stores an explicitly chosen language. Deliberately not
 *  Medusa's "lng": see problem 2 above. */
const STORAGE_KEY = "medusa_admin_lng";

// 1. `caches: ["cookie", "localStorage", "header"]` — and the same in `order`
const RE_DEAD_LOOKUP =
  /(caches|order)(\s*:\s*\[\s*"cookie"\s*,\s*"localStorage")\s*,\s*"header"(\s*\])/g;

// 2. `lookupCookie: "lng", lookupLocalStorage: "lng"`
const RE_LEGACY_LOOKUP =
  /(lookupCookie:\s*)"lng"(\s*,\s*lookupLocalStorage:\s*)"lng"/g;
const ALREADY_RENAMED = new RegExp(
  `lookupCookie:\\s*"${STORAGE_KEY}"\\s*,\\s*lookupLocalStorage:\\s*"${STORAGE_KEY}"`,
);

// 3. `order: [...] }, fallbackLng: …` — anchored so that only the i18n
//    config's fallback is rewritten, never some other "en". Accepts any
//    current value and an optional trailing comma (the TypeScript source has
//    one, the compiled dist does not), so a re-run or an upgrade from an older
//    form is idempotent.
const RE_STOCK_FALLBACK =
  /(order:\s*\[\s*"cookie"\s*,\s*"localStorage"\s*(?:,\s*"header")?\s*\]\s*,?\s*\}\s*,\s*fallbackLng:\s*)(?:"[a-z]+"|\[[^\]]*\])/g;
const FIXED_FALLBACK = '$1["vi", "en"]';
// Vietnamese first (the Admin's default), English second (safety net for any
// key a future Medusa release adds before this tool is re-run).
const ALREADY_FIXED =
  /order:\s*\[\s*"cookie"\s*,\s*"localStorage"\s*(?:,\s*"header")?\s*\]\s*,?\s*\}\s*,\s*fallbackLng:\s*\[\s*"vi"\s*,\s*"en"\s*\]/;

function findDashboardPackage(medusaRoot, backendDir) {
  const candidates = [
    ...new Set([
      path.join(medusaRoot, "node_modules", "@medusajs", "dashboard"),
      path.join(backendDir, "node_modules", "@medusajs", "dashboard"),
    ]),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "package.json"))) return dir;
  }
  return null;
}

/** `dist` .js/.mjs is what `medusa build` bundles; `src/i18n` .ts is what
 *  `medusa develop` may compile from. Both are scanned, neither is required. */
function candidateLanguageFiles(pkgDir) {
  const out = [];
  const walk = (dir, depth) => {
    if (depth > 5) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
      } else if (/\.(js|mjs|ts)$/.test(entry.name)) {
        out.push(full);
      }
    }
  };
  walk(path.join(pkgDir, "dist"), 0);
  walk(path.join(pkgDir, "src", "i18n"), 0);
  return out.sort();
}

/** Replace `re` exactly once. Zero matches = nothing to do; more than one =
 *  we cannot tell which occurrence is ours, so refuse to guess. */
function replaceOnce(text, re, replacement) {
  const hits = text.match(re);
  if (hits === null) return { text, applied: false };
  if (hits.length > 1) {
    throw new Error(
      `pattern matched ${hits.length} times in one file (expected 1): ${re}`,
    );
  }
  return { text: text.replace(re, replacement), applied: true };
}

/** Replace every occurrence — for patterns that may legitimately appear twice
 *  in one file (`caches` and `order` both list the dead lookup). */
function replaceAll(text, re, replacement) {
  const hits = text.match(re);
  if (hits === null) return { text, applied: false, count: 0 };
  return {
    text: text.replace(re, replacement),
    applied: true,
    count: hits.length,
  };
}

/** The three default-language fixes, applied to one file's text.
 *  Idempotent: a file already carrying all three reports `changed: false`,
 *  `complete: true`. */
function applyLanguageFixes(text) {
  const actions = [];
  let next = text;
  let changed = false;

  // 1. the dead "header" lookup in both `caches` and `order`
  const dead = replaceAll(next, RE_DEAD_LOOKUP, "$1$2$3");
  next = dead.text;
  if (dead.applied) {
    actions.push('drop dead "header" lookup');
    changed = true;
  }

  // 2. storage key, so a stale auto-written `lng=en` is never read back
  const key = replaceAll(
    next,
    RE_LEGACY_LOOKUP,
    `$1"${STORAGE_KEY}"$2"${STORAGE_KEY}"`,
  );
  next = key.text;
  if (key.applied) {
    actions.push(`storage key "lng" -> "${STORAGE_KEY}"`);
    changed = true;
  }

  // 3. Vietnamese default, English safety net
  if (!ALREADY_FIXED.test(next)) {
    const fb = replaceOnce(next, RE_STOCK_FALLBACK, FIXED_FALLBACK);
    next = fb.text;
    if (fb.applied) {
      actions.push("fallbackLng=[vi,en]");
      changed = true;
    }
  }

  const complete =
    !RE_DEAD_LOOKUP.test(next) &&
    ALREADY_RENAMED.test(next) &&
    ALREADY_FIXED.test(next);

  return { text: next, actions, changed, complete };
}

function applyDefaultLanguage({ medusaRoot, backendDir }, { write, enabled }) {
  const result = {
    status: "disabled",
    files: [],
    unchanged: [],
    unrecognised: [],
    applied: false,
  };

  if (!enabled) return result;

  const pkgDir = findDashboardPackage(medusaRoot, backendDir);
  if (!pkgDir) {
    return { ...result, status: "package-missing" };
  }

  const changed = [];
  const unchanged = [];
  const unrecognised = [];

  for (const file of candidateLanguageFiles(pkgDir)) {
    let text;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    // only files that look like they hold the i18n config are interesting
    if (!/detection:\s*\{|lookupCookie:|fallbackLng:/.test(text)) continue;

    const rel = path.relative(pkgDir, file);
    const fix = applyLanguageFixes(text);

    if (fix.changed) {
      changed.push({ file: rel, actions: fix.actions });
      if (write) {
        fs.writeFileSync(file, fix.text, "utf8");
        result.applied = true;
      }
    } else if (fix.complete) {
      unchanged.push({ file: rel, actions: fix.actions });
    } else {
      unrecognised.push(rel);
    }
  }

  result.files = changed;
  result.unchanged = unchanged;
  result.unrecognised = unrecognised;

  if (changed.length === 0 && unchanged.length === 0) {
    result.status = "not-found";
    result.files = [];
  } else if (changed.length > 0) {
    result.status = write ? "patched" : "would-patch";
  } else {
    result.status = "already-patched";
    result.applied = false;
  }

  return result;
}

function describeDefaultLanguage(r) {
  switch (r.status) {
    case "disabled":
      return "left stock (Vietnamese default disabled)";
    case "package-missing":
      return "@medusajs/dashboard not found";
    case "not-found":
      return "Medusa's i18n config was not recognised — check manually";
    case "already-patched":
      return "vi + en (already applied)";
    case "would-patch":
      return `vi + en (would patch ${r.files.length} file(s) — run without --check)`;
    case "patched":
      return `vi + en (patched ${r.files.length} file(s))`;
    default:
      return r.status;
  }
}

// ------------------------------------------------------------------ reporting

const INDEX_TEMPLATE = `import vi from "./json/vi.json" with { type: "json" }

/**
 * Generated by tools/admin-vi-i18n/patch-vi.mjs — do not edit by hand.
 * Medusa deep-merges this over its core translations, so keys here win.
 */
export default {
  vi: {
    translation: vi,
  },
}
`;

async function main() {
  const adminPath = resolveAdminPath();
  const { medusaRoot, backendDir } = resolveLayout(adminPath);
  const coreDir = findCoreTranslations(medusaRoot, backendDir);

  const coreEn = readJson(path.join(coreDir, "en.json"));
  const coreViPath = path.join(coreDir, "vi.json");
  const coreVi = fs.existsSync(coreViPath) ? readJson(coreViPath) : {};

  const { files: overrideFiles, merged: overrides } = loadOverrides();

  // en.json is the key source of truth; everything else fills values in.
  const merged = deepMerge(deepMerge(coreEn, coreVi), overrides);
  delete merged.$schema; // JSON-schema marker, not a translation

  const flatEn = flatten(coreEn);
  delete flatEn.$schema;
  const flatVi = flatten(merged);
  const flatCoreVi = flatten(coreVi);

  const keys = Object.keys(flatEn);
  const missing = keys.filter((k) => !(k in flatVi));
  const stillEnglish = keys.filter(
    (k) =>
      k in flatVi && flatVi[k] === flatEn[k] && typeof flatEn[k] === "string",
  );
  const newlyTranslated = keys.filter(
    (k) => k in flatVi && !(k in flatCoreVi) && flatVi[k] !== flatEn[k],
  );
  const unknownOverrides = Object.keys(flatten(overrides)).filter(
    (k) => !(k in flatEn),
  );

  const jsonOut = path.join(
    backendDir,
    "src",
    "admin",
    "i18n",
    "json",
    "vi.json",
  );
  const indexOut = path.join(backendDir, "src", "admin", "i18n", "index.ts");

  const existing = fs.existsSync(jsonOut) ? readJson(jsonOut) : null;
  const upToDate =
    existing !== null &&
    JSON.stringify(flatten(existing)) === JSON.stringify(flatVi);

  const shouldWrite = !flags.check && !flags.dryRun;

  // Must happen before `medusa build`, which regenerates the served bundle.
  const defaultLanguage = applyDefaultLanguage(
    { medusaRoot, backendDir },
    { write: shouldWrite, enabled: !flags.noDefaultVi },
  );

  const report = {
    adminPath,
    medusaRoot,
    backendDir,
    coreTranslations: coreDir,
    overrideFiles: overrideFiles.map((f) =>
      path.join("tools/admin-vi-i18n/overrides", f),
    ),
    outputs: { json: jsonOut, index: indexOut },
    keys: keys.length,
    translated: keys.length - stillEnglish.length,
    stillEnglish: stillEnglish.length,
    stillEnglishSamples: stillEnglish.slice(0, 15).map((k) => ({
      key: k,
      value: flatVi[k],
    })),
    missingFromVi: missing.length,
    newlyTranslated: newlyTranslated.length,
    unknownOverrides,
    upToDate,
    defaultLanguage,
    wrote: false,
    built: false,
    restarted: false,
  };

  if (flags.json) {
    // report is emitted after side effects below
  } else if (flags.check) {
    log("── Medusa Admin Vietnamese coverage ─────────────────────────");
    log(`  project        : ${adminPath}`);
    log(`  core en/vi     : ${coreDir}`);
    log(`  overrides      : ${overrideFiles.join(", ") || "(none)"}`);
    log(`  total keys     : ${report.keys}`);
    log(`  in Vietnamese  : ${report.translated}`);
    log(`  still English  : ${report.stillEnglish}`);
    log(`  missing        : ${report.missingFromVi}`);
    log(
      `  drift          : ${upToDate ? "none (output up to date)" : "output differs — run without --check"}`,
    );
    log(`  default lang   : ${describeDefaultLanguage(defaultLanguage)}`);
    if ((defaultLanguage.unrecognised ?? []).length) {
      log(
        `  warning: i18n config shape not recognised in ${defaultLanguage.unrecognised.join(", ")}`,
      );
    }
    if (report.stillEnglish) {
      log("  keys still in English:");
      for (const s of report.stillEnglishSamples) {
        log(`    ${s.key} = ${JSON.stringify(s.value)}`);
      }
      if (report.stillEnglish > report.stillEnglishSamples.length) {
        log(
          `    … and ${report.stillEnglish - report.stillEnglishSamples.length} more`,
        );
      }
    }
  }

  if (report.unknownOverrides.length && !flags.json) {
    log(
      `  warning: ${report.unknownOverrides.length} override key(s) not present in en.json ` +
        `(e.g. ${report.unknownOverrides.slice(0, 3).join(", ")})`,
    );
  }

  if (shouldWrite && !flags.json && !flags.check) {
    log("");
    log("── Default language ─────────────────────────────────────────");
    log(`  ${describeDefaultLanguage(defaultLanguage)}`);
    for (const f of defaultLanguage.files) {
      log(`    ${f.file}: ${f.actions.join(", ")}`);
    }
    for (const f of defaultLanguage.unchanged ?? []) {
      log(`    ${f.file}: already applied`);
    }
    if ((defaultLanguage.unrecognised ?? []).length) {
      log(
        `  warning: i18n config shape not recognised in ${defaultLanguage.unrecognised.join(", ")}`,
      );
    }
    if (defaultLanguage.files.length) {
      log(
        `  Language is stored under "${STORAGE_KEY}" — a "lng" value written`,
      );
      log("  before this run is ignored, so the Admin now opens Vietnamese.");
    }
    if (defaultLanguage.status === "not-found") {
      log("  warning: Medusa's i18n config changed shape; the Admin will");
      log("           keep opening in English until this is updated.");
    }
    if (defaultLanguage.status === "patched" && !flags.build) {
      log("  Re-run with --build for the change to reach the served bundle.");
    }
  }

  if (shouldWrite) {
    writeJson(jsonOut, unflatten(flatVi));
    fs.mkdirSync(path.dirname(indexOut), { recursive: true });
    fs.writeFileSync(indexOut, INDEX_TEMPLATE, "utf8");
    report.wrote = true;
    if (!flags.json) {
      log("");
      log("── Wrote ────────────────────────────────────────────────────");
      log(`  ${path.relative(process.cwd(), jsonOut)}`);
      log(`  ${path.relative(process.cwd(), indexOut)}`);
    }
  } else if (flags.dryRun && !flags.json) {
    log(`\n  (dry run) would write ${path.relative(process.cwd(), jsonOut)}`);
  }

  if (flags.build) {
    if (!flags.json)
      log("\n── Building admin (medusa build) ───────────────────────────");
    const build = spawnSync("yarn", ["build"], {
      cwd: backendDir,
      stdio: flags.json ? "ignore" : "inherit",
      env: process.env,
    });
    if (build.status !== 0) {
      throw new Error(`medusa build failed with exit code ${build.status}`);
    }
    report.built = true;
  }

  if (flags.restart) {
    if (!flags.json)
      log("\n── Restarting medusa ───────────────────────────────────────");
    const restart = spawnSync("pm2", ["restart", "medusa"], {
      stdio: flags.json ? "ignore" : "inherit",
      env: process.env,
    });
    if (restart.status !== 0) {
      throw new Error(
        `pm2 restart medusa failed with exit code ${restart.status}`,
      );
    }
    report.restarted = true;
  }

  if (flags.json) {
    console.log(JSON.stringify(report, null, 2));
  } else if (!flags.check) {
    log("");
    log(
      `Vietnamese coverage: ${report.translated}/${report.keys} keys ` +
        `(${report.stillEnglish} still English, ${report.missingFromVi} missing)`,
    );
    if (!flags.build && shouldWrite) {
      log("Next: run with --build --restart to rebuild the admin bundle.");
    }
  }

  return report;
}

main().catch((error) => {
  console.error(`\n✗ ${error.message}\n`);
  process.exit(1);
});
