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
 * (deepMerge(coreTranslations, customResources)), so no core file is edited and
 * nothing inside node_modules is touched. Re-running after a Medusa upgrade
 * re-syncs the dictionary against the new English source of truth.
 *
 * Merge order (later wins):
 *   1. core en.json        — the full key set (source of truth for keys)
 *   2. core vi.json        — Medusa's shipped Vietnamese
 *   3. overrides/*.json    — our translations (sorted by filename)
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

  const shouldWrite = !flags.check && !flags.dryRun;

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
