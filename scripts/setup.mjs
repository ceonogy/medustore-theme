#!/usr/bin/env node
/**
 * scripts/setup.mjs — half-automatic installer for the ZStore storefront.
 *
 * It wires this storefront to a running Medusa v2 backend, writes `.env`,
 * builds the site and (optionally) verifies a deployed domain. Nothing is
 * hidden: every step prints what it checked and what it wrote.
 *
 * Usage
 *   node scripts/setup.mjs                       # interactive
 *   node scripts/setup.mjs --backend-url https://adminstore.example.com \
 *        --publishable-key pk_... --region vn --yes
 *   node scripts/setup.mjs --verify-only --site-url https://store.example.com
 *
 * Flags
 *   --backend-url <url>       Medusa backend origin (no trailing slash)
 *   --publishable-key <key>   pk_... linked to the sales channel
 *   --region <iso2>           DEFAULT_REGION, e.g. vn
 *   --site-url <url>          verify a deployed storefront too
 *   --admin-email <email>     optional: log in to the Admin API to list keys/regions
 *   --admin-password <pass>   used in memory only, never written to disk
 *   --env-path <path>         target env file (default: ./.env)
 *                             NB: do not use --env-file — Node itself eats that flag.
 *   --skip-install            do not run `yarn install`
 *   --skip-build              do not run `yarn build`
 *   --verify-only             only run checks (writes nothing)
 *   --yes                     accept defaults, never prompt
 *   --force                   write .env even when the backend/key check failed
 *   -h, --help
 *
 * Exit code: 0 = all hard checks passed, 1 = something needs attention.
 */

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  chmodSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/* ------------------------------------------------------------------ args */

const parseArgs = (argv) => {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("-")) {
      out._.push(arg);
      continue;
    }
    const [name, inline] = arg.replace(/^--?/, "").split("=");
    const key = name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (inline !== undefined) {
      out[key] = inline;
    } else if (argv[i + 1] && !argv[i + 1].startsWith("-")) {
      out[key] = argv[++i];
    } else {
      out[key] = true;
    }
  }
  return out;
};

const args = parseArgs(process.argv.slice(2));

if (args.help || args.h) {
  const src = readFileSync(fileURLToPath(import.meta.url), "utf8");
  const doc = src.slice(src.indexOf("/**") + 3, src.indexOf("*/"));
  console.log(doc.replace(/^ \* ?/gm, "").trim());
  process.exit(0);
}

/* --------------------------------------------------------------- console */

const c = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  blue: (s) => `\x1b[1;34m${s}\x1b[0m`,
  green: (s) => `\x1b[1;32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[1;33m${s}\x1b[0m`,
  red: (s) => `\x1b[1;31m${s}\x1b[0m`,
};

const step = (n, total, title) =>
  console.log(`\n${c.blue(`[${n}/${total}]`)} ${c.bold(title)}`);
const ok = (msg) => console.log(`  ${c.green("✓")} ${msg}`);
const warn = (msg) => console.log(`  ${c.yellow("!")} ${msg}`);
// `bad` counts as a failed check so the exit code reflects it.
const bad = (msg) => {
  checks.push({ name: msg, passed: false, detail: "" });
  console.log(`  ${c.red("✗")} ${msg}`);
};
const info = (msg) => console.log(`  ${c.dim(msg)}`);

/* --------------------------------------------------------------- helpers */

const checks = [];

const isTTY = Boolean(stdin.isTTY);
const autoYes = Boolean(args.yes);
const verifyOnly = Boolean(args.verifyOnly);
const envFile = path.resolve(
  ROOT,
  args.envPath ?? args.env ?? process.env.SETUP_ENV_FILE ?? ".env",
);

const readEnvFile = (file) => {
  if (!existsSync(file)) return {};
  const out = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
};

/** Update keys in place (keeps comments + unknown vars), append the new ones. */
const writeEnvFile = (file, vars) => {
  const base = existsSync(file)
    ? readFileSync(file, "utf8")
    : existsSync(path.join(ROOT, ".env.example"))
      ? readFileSync(path.join(ROOT, ".env.example"), "utf8")
      : "";
  const lines = base.split(/\r?\n/);
  const seen = new Set();
  const quote = (v) => (/[\s#"'`]/.test(v) ? `"${v.replace(/"/g, '\\"')}"` : v);
  const updated = lines.map((line) => {
    const m = line.match(/^([A-Z0-9_]+)=/);
    if (m && vars[m[1]] !== undefined) {
      seen.add(m[1]);
      return `${m[1]}=${quote(String(vars[m[1]]))}`;
    }
    return line;
  });
  for (const [key, value] of Object.entries(vars)) {
    if (!seen.has(key)) updated.push(`${key}=${quote(String(value))}`);
  }
  const text = updated.join("\n").replace(/\n{3,}/g, "\n\n").replace(/\n*$/, "\n");
  writeFileSync(file, text, { mode: 0o600 });
  try {
    chmodSync(file, 0o600);
  } catch {
    /* best effort (non-POSIX) */
  }
};

const mask = (value) =>
  !value ? "(empty)" : value.length <= 12 ? `${value.slice(0, 4)}…` : `${value.slice(0, 8)}…${value.slice(-4)}`;

const trimUrl = (value) => String(value ?? "").trim().replace(/\/+$/, "");

const request = async (url, init = {}, timeoutMs = 15000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { status: res.status, body, headers: res.headers };
  } catch (error) {
    return { status: 0, body: null, error: String(error?.message ?? error) };
  } finally {
    clearTimeout(timer);
  }
};

const jsonHeaders = (extra = {}) => ({
  accept: "application/json",
  "content-type": "application/json",
  ...extra,
});

const ask = async (question, fallback = "") => {
  if (autoYes) return fallback;
  if (!isTTY) {
    throw new Error(
      `Missing value for "${question}" and no TTY to prompt. Pass it as a flag (see --help).`,
    );
  }
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await rl.question(
      fallback ? `${question} ${c.dim(`[${fallback}]`)}: ` : `${question}: `,
    );
    return answer.trim() || fallback;
  } finally {
    rl.close();
  }
};

const choose = async (question, options, fallbackIndex = 0) => {
  if (autoYes || !isTTY) return options[fallbackIndex];
  console.log(`  ${question}`);
  options.forEach((option, i) => console.log(`    ${i + 1}. ${option.label}`));
  const answer = await ask(`Choose 1-${options.length}`, String(fallbackIndex + 1));
  const index = Number(answer) - 1;
  return options[Number.isInteger(index) && options[index] ? index : fallbackIndex];
};

const run = (command, commandArgs, label) => {
  info(`$ ${command} ${commandArgs.join(" ")}`);
  execFileSync(command, commandArgs, { cwd: ROOT, stdio: "inherit" });
  ok(label);
};

/* ------------------------------------------------------------------ main */

const env = readEnvFile(envFile);

const record = (name, passed, detail = "") => {
  checks.push({ name, passed, detail });
  (passed ? ok : bad)(detail ? `${name} — ${detail}` : name);
};

const main = async () => {
  console.log(c.bold("\nZStore storefront setup"));
  console.log(c.dim(`repo: ${ROOT}`));
  console.log(c.dim(`env:  ${envFile}${existsSync(envFile) ? "" : " (will be created)"}`));

  /* 1. prerequisites ---------------------------------------------------- */
  step(1, 6, "Prerequisites");

  const nodeMajor = Number(process.versions.node.split(".")[0]);
  record(`Node.js ${process.versions.node}`, nodeMajor >= 20, nodeMajor >= 20 ? "" : "need >= 20");

  let yarnVersion = null;
  try {
    yarnVersion = execFileSync("yarn", ["--version"], { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    /* missing */
  }
  record(
    `Yarn ${yarnVersion ?? "not found"}`,
    Boolean(yarnVersion),
    yarnVersion ? "" : "run `corepack enable`",
  );

  /* 2. backend ---------------------------------------------------------- */
  step(2, 6, "Medusa backend");

  let backendUrl = trimUrl(args.backendUrl ?? env.PUBLIC_MEDUSA_BACKEND_URL);
  if (!backendUrl) {
    backendUrl = trimUrl(
      await ask("Backend origin (PUBLIC_MEDUSA_BACKEND_URL)", "http://127.0.0.1:9000"),
    );
  }
  info(`backend: ${backendUrl}`);

  const health = await request(`${backendUrl}/health`);
  const healthOk = health.status === 200;
  record(
    "GET /health",
    health.status === 200,
    health.status === 200 ? "200" : health.error ?? `HTTP ${health.status}`,
  );

  let publishableKey = String(
    args.publishableKey ?? env.PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "",
  ).trim();
  // "unknown" = never checked (no key, or backend unreachable), "rejected" = the
  // backend answered 400/401 for this key.
  let keyState = "unknown";
  let region = String(args.region ?? env.DEFAULT_REGION ?? "").trim().toLowerCase();

  // Optional Admin API login — lets the script list real keys and regions.
  let adminToken = null;
  const adminEmail = args.adminEmail;
  const adminPassword = args.adminPassword;
  if (adminEmail && adminPassword) {
    const login = await request(`${backendUrl}/auth/user/emailpass`, {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ email: adminEmail, password: adminPassword }),
    });
    if (login.status === 200 && login.body?.token) {
      adminToken = login.body.token;
      ok("admin login OK");
    } else {
      warn(`admin login failed (HTTP ${login.status}) — continuing without it`);
    }
  }

  let storeRegions = [];
  if (publishableKey) {
    const regions = await request(`${backendUrl}/store/regions?limit=50`, {
      headers: jsonHeaders({ "x-publishable-api-key": publishableKey }),
    });
    if (regions.status === 200) {
      storeRegions = regions.body?.regions ?? [];
      keyState = "ok";
      ok(`publishable key accepted — ${storeRegions.length} region(s)`);
    } else {
      keyState = regions.status === 400 || regions.status === 401 ? "rejected" : keyState;
      warn(`publishable key rejected (HTTP ${regions.status})`);
    }
  }

  if (adminToken && (!publishableKey || !storeRegions.length)) {
    const keys = await request(`${backendUrl}/admin/publishable-api-keys?limit=50`, {
      headers: jsonHeaders({ authorization: `Bearer ${adminToken}` }),
    });
    const list = keys.body?.publishable_api_keys ?? keys.body?.keys ?? [];
    const withToken = list.filter((key) => key.token);
    if (keys.status === 200 && withToken.length) {
      if (!publishableKey && withToken.length === 1) {
        publishableKey = withToken[0].token;
        ok(`using publishable key "${withToken[0].title ?? withToken[0].id}"`);
      } else if (!publishableKey) {
        const picked = await choose(
          "Pick a publishable key",
          withToken.map((key) => ({
            label: `${key.title ?? key.id} (${mask(key.token)})`,
            value: key.token,
          })),
        );
        publishableKey = picked.value;
      }
    } else if (!publishableKey) {
      warn("could not list publishable keys — copy one from Settings → Publishable API keys");
    }
  }

  if (!publishableKey) {
    publishableKey = String(
      await ask("Publishable API key (pk_...)", ""),
    ).trim();
    if (!publishableKey) {
      bad("no publishable key — create one in Admin → Settings → Publishable API keys");
    }
  }

  if (publishableKey && !storeRegions.length) {
    const regions = await request(`${backendUrl}/store/regions?limit=50`, {
      headers: jsonHeaders({ "x-publishable-api-key": publishableKey }),
    });
    if (regions.status === 200) {
      storeRegions = regions.body?.regions ?? [];
      keyState = "ok";
      ok(`publishable key accepted — ${storeRegions.length} region(s)`);
    } else {
      keyState = regions.status === 400 || regions.status === 401 ? "rejected" : keyState;
      bad(`publishable key rejected (HTTP ${regions.status})`);
    }
  }

  const countries = storeRegions.flatMap((r) =>
    (r.countries ?? []).map((country) => ({
      iso: String(country.iso_2 ?? "").toLowerCase(),
      label: `${country.display_name ?? country.name ?? country.iso_2} — ${r.name} (${String(r.currency_code ?? "").toUpperCase()})`,
      region: r,
    })),
  );

  // Prefer Viet Nam when the operator does not pick anything (auto mode).
  const preferred = countries.findIndex(
    (country) => country.iso === (region || "vn"),
  );
  if (!region && countries.length) {
    const picked = await choose(
      "Pick the default country",
      countries,
      preferred >= 0 ? preferred : 0,
    );
    region = picked.iso;
  }
  let regionValid = true;
  if (region) {
    const match = countries.find((country) => country.iso === region);
    regionValid = countries.length === 0 || Boolean(match);
    record(
      `DEFAULT_REGION=${region}`,
      countries.length === 0 || Boolean(match),
      match
        ? match.label
        : countries.length
          ? "not present in /store/regions"
          : keyState === "rejected"
            ? "cannot be validated — the key was rejected"
            : "no regions yet",
    );
  } else {
    warn("no DEFAULT_REGION set and the backend returned no regions");
  }

  const products = await request(`${backendUrl}/store/products?limit=1`, {
    headers: jsonHeaders({ "x-publishable-api-key": publishableKey }),
  });
  if (products.status === 200) {
    const count = products.body?.products?.length ?? 0;
    (count ? ok : warn)(
      count
        ? "store API returns products"
        : "store API works but has no products for this key/sales channel",
    );
  } else {
    warn(`store products check failed (HTTP ${products.status})`);
  }

  /* 3. env -------------------------------------------------------------- */
  step(3, 6, verifyOnly ? "Environment (verify-only, not written)" : "Write .env");

  const envVars = {
    PUBLIC_MEDUSA_BACKEND_URL: backendUrl,
    PUBLIC_MEDUSA_PUBLISHABLE_KEY: publishableKey,
  };
  if (region) envVars.DEFAULT_REGION = region;
  if (args.s3Domain) envVars.S3_DOMAIN = String(args.s3Domain);
  if (args.stripeKey) envVars.PUBLIC_STRIPE_KEY = String(args.stripeKey);

  const shown = path.relative(ROOT, envFile);
  const envLabel = shown.startsWith("..") ? envFile : shown;

  if (verifyOnly) {
    info(`PUBLIC_MEDUSA_BACKEND_URL=${backendUrl}`);
    info(`PUBLIC_MEDUSA_PUBLISHABLE_KEY=${mask(publishableKey)}`);
    info(`DEFAULT_REGION=${region || "(unset)"}`);
  } else if (!publishableKey && !args.force) {
    bad(`not writing ${envLabel} — no publishable key (use --force to override)`);
  } else if (!healthOk && !args.force) {
    bad(`not writing ${envLabel} — the backend did not answer /health (use --force to override)`);
  } else if (!regionValid && !args.force) {
    bad(`not writing ${envLabel} — DEFAULT_REGION=${region} is not offered by /store/regions (use --force to override)`);
  } else if (keyState === "rejected" && !args.force) {
    bad(`not writing ${envLabel} — the backend rejected this publishable key (use --force to override)`);
  } else {
    writeEnvFile(envFile, envVars);
    ok(`wrote ${envLabel} (mode 600)`);
    info(`PUBLIC_MEDUSA_PUBLISHABLE_KEY=${mask(publishableKey)}`);
  }

  /* 4. install & build -------------------------------------------------- */
  step(4, 6, "Install & build");
  if (verifyOnly) {
    info("skipped (verify-only)");
  } else {
    if (args.skipInstall) {
      info("skipped yarn install (--skip-install)");
    } else if (yarnVersion) {
      run("yarn", ["install"], "dependencies installed");
    }
    if (args.skipBuild) {
      info("skipped yarn build (--skip-build)");
    } else if (yarnVersion) {
      run("yarn", ["build"], "storefront built");
    }
  }

  /* 5. verify ----------------------------------------------------------- */
  step(5, 6, "Verify");

  const builtEntry = path.join(ROOT, "dist", "server", "entry.mjs");
  if (!verifyOnly) {
    record("dist/server/entry.mjs exists", existsSync(builtEntry), existsSync(builtEntry) ? "" : "run yarn build");
  }

  const siteUrl = trimUrl(args.siteUrl ?? env.SITE_URL ?? "");
  if (siteUrl) {
    for (const route of ["/", "/store", "/checkout"]) {
      const res = await request(`${siteUrl}${route}`, {}, 20000);
      record(`site ${route}`, res.status === 200, res.error ?? `HTTP ${res.status}`);
    }
    const proxied = await request(`${siteUrl}/medusa/store/regions?limit=1`, {
      headers: jsonHeaders({ "x-publishable-api-key": publishableKey }),
    });
    record(
      "site /medusa proxy",
      proxied.status === 200,
      proxied.status === 200 ? "200" : proxied.error ?? `HTTP ${proxied.status}`,
    );
    const goship = await request(`${siteUrl}/medusa/store/goship/config`, {
      headers: jsonHeaders({ "x-publishable-api-key": publishableKey }),
    });
    if (goship.status === 200) ok("GoShip addon reachable (optional)");
    else info(`GoShip addon not installed or disabled (HTTP ${goship.status}) — optional`);
    const sepay = await request(`${siteUrl}/medusa/store/sepay/order/nope`, {
      headers: jsonHeaders({ "x-publishable-api-key": publishableKey }),
    });
    if (sepay.status === 404) ok("SePay addon reachable (optional)");
    else info(`SePay addon not installed (HTTP ${sepay.status}) — optional`);
  } else {
    info("skip live-site checks (pass --site-url https://store.example.com)");
  }

  /* 6. next steps ------------------------------------------------------- */
  step(6, 6, "Next steps");

  const failed = checks.filter((check) => !check.passed);
  if (failed.length) {
    warn(`${failed.length} check(s) need attention:`);
    failed.forEach((check) => console.log(`    - ${check.name}${check.detail ? `: ${check.detail}` : ""}`));
  } else {
    ok("all hard checks passed");
  }

  console.log(`
${c.bold("Run the storefront")}
  yarn dev                                   # development, http://127.0.0.1:3001
  yarn build && node ./dist/server/entry.mjs  # production
  pm2 start ecosystem.config.cjs              # pm2 (app name: storefront)

${c.bold("Reverse proxy")} (TLS terminates here; proxy everything to 3001)
  storefront.example.com  →  http://127.0.0.1:3001
  adminstore.example.com  →  http://127.0.0.1:9000   (Medusa)

  /medusa/* is proxied by Astro middleware — do not add a separate rule.

${c.bold("Backend CORS")} must list both origins exactly (scheme + host, no slash):
  STORE_CORS=https://storefront.example.com
  ADMIN_CORS=https://adminstore.example.com
  AUTH_CORS=https://adminstore.example.com

${c.bold("Re-check any time")}
  node scripts/setup.mjs --verify-only --site-url https://storefront.example.com
`);

  process.exit(failed.length ? 1 : 0);
};

main().catch((error) => {
  console.error(`\n${c.red("setup failed:")} ${error?.message ?? error}`);
  process.exit(1);
});
