/**
 * Runtime test for the Vietnamese admin translation.
 *
 * Reproduces the exact runtime the Medusa Admin uses:
 *   - i18next + i18next-browser-languagedetector
 *   - defaultI18nOptions verbatim from @medusajs/dashboard/src/i18n/config.ts
 *   - resources = deepMerge(coreTranslations, customResources) as documented at
 *     https://docs.medusajs.com/learn/fundamentals/admin/translations
 *
 * Usage:
 *   node tools/admin-vi-i18n/test-runtime.cjs
 *   node tools/admin-vi-i18n/test-runtime.cjs --admin-path /home/medusa
 *   MEDUSA_ADMIN_PATH=/home/medusa node tools/admin-vi-i18n/test-runtime.cjs
 *
 * Exit code 0 = all assertions passed.
 */
const fs = require("fs");
const path = require("path");

// Same path resolution as patch-vi.mjs: flag > env > config.json
const argv = process.argv.slice(2);
const flagIdx = argv.indexOf("--admin-path");
const configFile = path.join(__dirname, "config.json");
const EXPLICIT_PATH =
  (flagIdx > -1 && argv[flagIdx + 1]) ||
  process.env.MEDUSA_ADMIN_PATH ||
  (fs.existsSync(configFile)
    ? JSON.parse(fs.readFileSync(configFile, "utf8")).adminPath
    : undefined);
const ADMIN_PATH = path.resolve(EXPLICIT_PATH || "/home/medusa");

const ROOT = ADMIN_PATH;
const CORE = path.join(
  ROOT,
  "node_modules/@medusajs/dashboard/src/i18n/translations",
);
const OURS = path.join(ROOT, "apps/backend/src/admin/i18n/json/vi.json");

if (!fs.existsSync(CORE) || !fs.existsSync(OURS)) {
  if (EXPLICIT_PATH) {
    // the path was requested explicitly: that is a configuration error
    console.error(
      `Missing inputs.\n  core: ${CORE}\n  ours: ${OURS}\n` +
        "Run patch-vi.mjs first, or point --admin-path at a Medusa checkout.",
    );
    process.exit(2);
  }
  // `node --test` (and therefore `yarn test` in CI) picks this file up, but a
  // runner that only has this repository has no Medusa checkout to test
  // against. Skip rather than fail; the assertions are worthless there anyway.
  console.log(
    `SKIP  no Medusa project at ${ROOT}\n` +
      "      pass --admin-path <medusa-root> (or MEDUSA_ADMIN_PATH) to run it for real.",
  );
  process.exit(0);
}

// i18next must resolve from the Medusa project, not from this repo
module.paths.unshift(path.join(ROOT, "node_modules"));
const NODE_PATH = process.env.NODE_PATH;
process.env.NODE_PATH = [path.join(ROOT, "node_modules"), NODE_PATH]
  .filter(Boolean)
  .join(path.delimiter);
require("module").Module._initPaths();

const i18next = require("i18next");
const LanguageDetector = require("i18next-browser-languagedetector");

const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const isObj = (v) => typeof v === "object" && v && !Array.isArray(v);
const deepMerge = (a, b) => {
  const out = { ...a };
  for (const [k, v] of Object.entries(b || {})) {
    out[k] = isObj(v) && isObj(out[k]) ? deepMerge(out[k], v) : v;
  }
  return out;
};
const flatten = (o, p = "", acc = {}) => {
  for (const [k, v] of Object.entries(o)) {
    const key = p ? `${p}.${k}` : k;
    isObj(v) ? flatten(v, key, acc) : (acc[key] = v);
  }
  return acc;
};

// --- what the dashboard bundles as coreTranslations -------------------------
const coreResources = {};
for (const f of fs.readdirSync(CORE)) {
  if (f.endsWith(".json") && f !== "$schema.json") {
    const lang = f.replace(/\.json$/, "");
    coreResources[lang] = { translation: read(`${CORE}/${f}`) };
  }
}
const custom = { vi: { translation: read(OURS) } };
const resources = deepMerge(coreResources, custom); // exactly as the dashboard does

// --- the defaults the Admin ACTUALLY ships with (dist, post-patch) ---------
// Read live rather than copied, so this test fails if the default-language
// patch is ever lost — e.g. after `yarn install` — and the tool must be re-run.
const DASHBOARD = path.join(ROOT, "node_modules/@medusajs/dashboard");

function readLiveConfig() {
  let entries;
  try {
    entries = fs.readdirSync(path.join(DASHBOARD, "dist"));
  } catch {
    return null;
  }
  for (const f of entries.filter((f) => /\.(js|mjs)$/.test(f))) {
    const text = fs.readFileSync(path.join(DASHBOARD, "dist", f), "utf8");
    const m =
      /detection:\s*\{([\s\S]{0,600}?)\}\s*,\s*fallbackLng:\s*("[^"]+"|\[[^\]]*\])/.exec(
        text,
      );
    if (!m) continue;
    const block = m[1];
    const arr = (name) => {
      const r = new RegExp(`${name}:\\s*\\[([^\\]]*)\\]`).exec(block);
      if (!r) return null;
      return r[1]
        .split(",")
        .map((s) => s.trim().replace(/^"|"$/g, ""))
        .filter(Boolean);
    };
    const grab = (name) =>
      (new RegExp(`${name}:\\s*"([^"]+)"`).exec(block) || [])[1];
    return {
      file: `dist/${f}`,
      caches: arr("caches"),
      order: arr("order"),
      lookupCookie: grab("lookupCookie"),
      lookupLocalStorage: grab("lookupLocalStorage"),
      // normalise to an array: i18next accepts a string or a list
      fallbackLng: m[2].startsWith("[")
        ? m[2]
            .slice(1, -1)
            .split(",")
            .map((s) => s.trim().replace(/["']/g, ""))
            .filter(Boolean)
        : [m[2].replace(/["']/g, "")],
    };
  }
  return null;
}

const live = readLiveConfig();
if (!live) {
  console.error(
    "FAIL  could not read the i18n config from @medusajs/dashboard/dist\n" +
      `      looked in ${path.join(DASHBOARD, "dist")}`,
  );
  process.exit(2);
}

const defaultI18nOptions = {
  debug: false,
  detection: {
    caches: live.caches,
    lookupCookie: live.lookupCookie,
    lookupLocalStorage: live.lookupLocalStorage,
    order: live.order,
  },
  fallbackLng: live.fallbackLng,
  fallbackNS: "translation",
  interpolation: { escapeValue: false },
};

// i18next-browser-languagedetector v7 registry — anything else is a no-op
const REGISTERED_LOOKUPS = [
  "querystring",
  "cookie",
  "localStorage",
  "sessionStorage",
  "navigator",
  "htmlTag",
  "path",
  "subdomain",
];

let pass = 0;
let fail = 0;
const assert = (name, cond, extra = "") => {
  cond ? pass++ : fail++;
  console.log(
    `  ${cond ? "PASS" : "FAIL"}  ${name}${extra ? `  -> ${extra}` : ""}`,
  );
};

const coreEnFlat = flatten(coreResources.en.translation);
const coreViFlat = flatten(coreResources.vi.translation);
const ourViFlat = flatten(custom.vi.translation);

console.log("── defaults the Admin actually ships with ─────────────────");
assert(
  "live i18n config found in @medusajs/dashboard/dist",
  typeof live.file === "string",
  live.file,
);
assert(
  "default language is Vietnamese (fallbackLng starts with vi)",
  live.fallbackLng[0] === "vi",
  `fallbackLng=${JSON.stringify(live.fallbackLng)}  [re-run patch-vi.mjs if this is not vi]`,
);
assert(
  "English stays as the safety net for untranslated keys",
  live.fallbackLng.includes("en"),
  JSON.stringify(live.fallbackLng),
);
assert(
  "only registered lookups in the detection order",
  live.order.every((n) => REGISTERED_LOOKUPS.includes(n)),
  `order=${JSON.stringify(live.order)}`,
);
assert(
  "stored language is read from cookie + localStorage",
  live.order.includes("cookie") && live.order.includes("localStorage"),
  `order=${JSON.stringify(live.order)}`,
);
assert(
  "language stored under a key the old auto-written value cannot occupy",
  live.lookupCookie === "medusa_admin_lng" &&
    live.lookupLocalStorage === "medusa_admin_lng",
  `cookie=${live.lookupCookie} localStorage=${live.lookupLocalStorage}`,
);

(async () => {
  console.log("── environment shipped to the admin ─────────────────────────");
  assert(
    "'vi' is a supported language (shows in Profile → Language)",
    Object.keys(resources).includes("vi"),
    Object.keys(resources).length + " languages",
  );
  const coreViKeys = Object.keys(coreViFlat).filter((k) => k !== "$schema");
  const coreEnKeys = Object.keys(coreEnFlat).filter((k) => k !== "$schema");
  assert(
    "our dictionary covers every core Vietnamese key ($schema excluded)",
    coreViKeys.every((k) => k in ourViFlat),
    `${Object.keys(ourViFlat).length} keys vs core ${coreViKeys.length}, missing ${
      coreViKeys.filter((k) => !(k in ourViFlat)).length
    }`,
  );
  assert(
    "our dictionary covers the full English key set ($schema excluded)",
    coreEnKeys.every((k) => k in ourViFlat),
    `${coreEnKeys.length} en keys, missing ${
      coreEnKeys.filter((k) => !(k in ourViFlat)).length
    }`,
  );

  // ── run 1: a Vietnamese admin (lng=vi) ───────────────────────────────────
  await i18next
    .use(
      new LanguageDetector(null, {
        lookupCookie: "lng",
        lookupLocalStorage: "lng",
      }),
    )
    .init({
      ...defaultI18nOptions,
      resources,
      supportedLngs: Object.keys(resources),
      lng: "vi",
    });

  console.log(
    "\n── a key ONLY our tool provides ─────────────────────────────",
  );
  assert(
    "t('roles.subtitle') is Vietnamese",
    i18next.t("roles.subtitle") === "Quản lý các vai trò và quyền truy cập.",
    i18next.t("roles.subtitle"),
  );
  assert(
    "t('actions.save') is Vietnamese",
    i18next.t("actions.save") !== coreEnFlat["actions.save"] &&
      i18next.t("actions.save") === coreViFlat["actions.save"],
    i18next.t("actions.save"),
  );
  assert(
    "no key renders as a raw dotted key",
    !Object.values([
      "roles.subtitle",
      "roles.create.header",
      "general.selectAll",
      "profile.mfa.title",
    ]).some((k) => i18next.t(k) === k),
  );

  console.log(
    "\n── pluralisation (vi uses _one / _other) ────────────────────",
  );
  assert(
    "t('roles.users.add.successToast', {count:2})",
    i18next.t("roles.users.add.successToast", { count: 2 }) ===
      "Đã thêm người dùng vào vai trò.",
    i18next.t("roles.users.add.successToast", { count: 2 }),
  );
  assert(
    "t('general.values', {count:1}) -> plural + interpolation",
    i18next.t("general.values", { count: 1 }) === "1 giá trị",
    i18next.t("general.values", { count: 1 }),
  );

  console.log(
    "\n── variable interpolation ───────────────────────────────────",
  );
  assert(
    "t('roles.create.successToast', {name:'CMS'})",
    i18next.t("roles.create.successToast", { name: "CMS" }) ===
      "Đã tạo vai trò CMS",
    i18next.t("roles.create.successToast", { name: "CMS" }),
  );
  assert(
    "element interpolation <0>… from core survives",
    typeof i18next.t("campaigns.totalSpend", { count: 1 }) === "string" &&
      i18next.t("campaigns.totalSpend").includes("{{amount}}"),
    i18next.t("campaigns.totalSpend"),
  );

  console.log(
    "\n── doc's documented fallback chain ──────────────────────────",
  );
  // custom key missing -> core Vietnamese. Strip from OUR copy BEFORE merging,
  // otherwise deepMerge would delete it from the merged result too.
  const ourMinusActions = { ...custom.vi.translation };
  delete ourMinusActions.actions;
  const stripped = deepMerge(coreResources, {
    vi: { translation: ourMinusActions },
  });
  i18next.init({ ...defaultI18nOptions, resources: stripped, lng: "vi" });
  assert(
    "key removed from our file falls back to CORE vi",
    i18next.t("actions.save") === coreViFlat["actions.save"],
    i18next.t("actions.save"),
  );
  // key missing from every vi file -> English
  const noVi = deepMerge(coreResources, { vi: { translation: {} } });
  delete noVi.vi;
  i18next.init({ ...defaultI18nOptions, resources: noVi, lng: "vi" });
  assert(
    "key absent from vi entirely falls back to en",
    i18next.t("actions.save") === coreEnFlat["actions.save"],
    i18next.t("actions.save"),
  );
  assert(
    "unknown key renders the key itself (as documented)",
    i18next.t("brands.not.a.real.key") === "brands.not.a.real.key",
  );

  // ── run 2: what a fresh visit now gets ───────────────────────────────────
  console.log("\n── default language on a fresh visit ──────────────────────");
  const fresh = (mod) => {
    const p = require.resolve(mod);
    delete require.cache[p];
    return require(p);
  };
  const setNavigator = (lang) => {
    try {
      Object.defineProperty(globalThis, "navigator", {
        value: { language: lang, languages: [lang] },
        configurable: true,
      });
      return true;
    } catch {
      return false;
    }
  };
  // the detector's cookie lookup is just document.cookie
  const setStoredCookie = (name, value) => {
    Object.defineProperty(globalThis, "document", {
      value: { cookie: value ? `${name}=${value}` : "" },
      configurable: true,
    });
  };
  const setStoredLanguage = (value) =>
    setStoredCookie(live.lookupCookie, value);
  const newAdmin = async () => {
    const i18nFresh = fresh("i18next");
    const Detector = fresh("i18next-browser-languagedetector");
    await i18nFresh
      .use(
        new Detector(null, {
          lookupCookie: live.lookupCookie,
          lookupLocalStorage: live.lookupLocalStorage,
        }),
      )
      .init({
        ...defaultI18nOptions,
        resources,
        supportedLngs: Object.keys(resources),
      });
    return i18nFresh;
  };

  for (const lang of ["vi-VN", "en-US", "fr-FR", "de"]) {
    setNavigator(lang);
    setStoredLanguage(null);
    // each browser visit = a fresh i18next module, exactly like a page load
    const i18nFresh = fresh("i18next");
    const Detector = fresh("i18next-browser-languagedetector");
    const det = new Detector(null, {
      lookupCookie: live.lookupCookie,
      lookupLocalStorage: live.lookupLocalStorage,
    });
    const detected = det.detect();
    await i18nFresh.use(det).init({
      ...defaultI18nOptions,
      resources,
      supportedLngs: Object.keys(resources),
    });
    assert(
      `fresh visit, browser ${lang} -> Vietnamese admin`,
      i18nFresh.language === "vi" &&
        i18nFresh.t("roles.create.header") === "Tạo vai trò",
      `detected=${JSON.stringify(detected)} language=${i18nFresh.language}`,
    );
  }

  // the very first screen a visitor meets is the login form
  console.log("\n── login screen (the first thing anyone sees) ────────────");
  const loginKeys = Object.keys(ourViFlat).filter((k) => /^login\./.test(k));
  assert(
    "every login key is translated (stock Medusa has 3 of 15)",
    loginKeys.length === 15 && loginKeys.every((k) => k in coreEnFlat),
    `${loginKeys.length} keys`,
  );
  const i18nLogin = await newAdmin();
  assert(
    "login screen renders Vietnamese by default",
    i18nLogin.t("login.title") === "Chào mừng đến với Medusa" &&
      i18nLogin.t("login.hint") === "Đăng nhập để truy cập khu vực tài khoản",
    `${i18nLogin.t("login.title")} / ${i18nLogin.language}`,
  );
  assert(
    "MFA step (missing from stock vi.json) renders Vietnamese",
    i18nLogin.t("login.mfa.verify") === "Xác minh" &&
      i18nLogin.t("login.mfa.backToLogin") === "Quay lại đăng nhập",
    i18nLogin.t("login.mfa.verify"),
  );

  // a browser that opened the Admin before this patch carries the value the
  // old broken detection auto-wrote; it must not win any more
  console.log("\n── browsers that visited before this patch ───────────────");
  setStoredCookie("lng", "en"); // Medusa's old key, value "en"
  const stale = await newAdmin();
  assert(
    "stale auto-written lng=en is ignored -> Vietnamese",
    stale.language === "vi" && stale.t("actions.save") === "Lưu",
    `language=${stale.language} actions.save=${stale.t("actions.save")}`,
  );
  setStoredLanguage(null);

  // an explicit Profile → Language choice is cached and keeps winning
  console.log("\n── explicit choice (Profile → Language) still wins ────────");
  for (const [stored, expected] of [
    ["en", "Save"],
    ["vi", "Lưu"],
  ]) {
    setStoredLanguage(stored);
    const i18nChoice = fresh("i18next");
    const Detector2 = fresh("i18next-browser-languagedetector");
    await i18nChoice
      .use(
        new Detector2(null, {
          lookupCookie: live.lookupCookie,
          lookupLocalStorage: live.lookupLocalStorage,
        }),
      )
      .init({
        ...defaultI18nOptions,
        resources,
        supportedLngs: Object.keys(resources),
      });
    assert(
      `stored lng=${stored} is honoured`,
      i18nChoice.language === stored &&
        i18nChoice.t("actions.save") === expected,
      `language=${i18nChoice.language} actions.save=${i18nChoice.t("actions.save")}`,
    );
  }
  setStoredLanguage(null);

  console.log(
    `\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`,
  );
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error("TEST ERROR:", e);
  process.exit(1);
});
