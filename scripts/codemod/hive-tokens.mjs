// Migración de nombres Alma → tokens HIVE (spec §6.2–6.3).
// Uso: node scripts/codemod/hive-tokens.mjs [--dry]
// Se borra en la Tarea 12, cuando las guardias impiden volver atrás.
import fs from "node:fs";
import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const zoneOf = (file) => (/(^|\/)src\/(pages|components)\/admin\//.test(file) ? "admin" : "app");

/* ── Clases de Tailwind ─────────────────────────────────────────────── */
const CLASS_BASE = {
  canvas: "canvas", mist: "sunken", oat: "sunken", stone: "ink-muted",
  ink: "ink", "ink-deep": "inverse", hairline: "line", olive: "success",
};
const FILL = new Set(["bg", "from", "via", "to"]);
const CONTROL = new Set(["border", "ring", "outline"]);
const TEXTISH = new Set(["text", "placeholder"]);

export function mapClassColor(prefix, color, zone) {
  if (color === "sandstone") return CONTROL.has(prefix) ? "line-strong" : TEXTISH.has(prefix) ? "ink-muted" : "line";
  if (color === "berry") return FILL.has(prefix) || zone === "admin" ? "ink" : "accent-strong";
  const out = CLASS_BASE[color];
  if (!out) throw new Error(`Color de Alma sin mapeo: ${color}`);
  return out;
}

const CLASS_RE =
  /\b(bg|text|border|ring-offset|ring|outline|divide|from|via|to|fill|stroke|placeholder|shadow|decoration|caret|accent)-alma-(ink-deep|canvas|mist|oat|sandstone|stone|berry|ink|hairline|olive)(?![\w-])/g;

export const transformClasses = (src, zone) =>
  src.replace(CLASS_RE, (_, prefix, color) => `${prefix}-${mapClassColor(prefix, color, zone)}`);

/* ── Referencias ALMA.* en estilos en línea ─────────────────────────── */
const REF_BASE = {
  cream: "canvas", mist: "sunken", blush: "sunken", stone: "inkMuted", coral: "inkMuted",
  ink: "ink", inkDeep: "inverse", border: "line", olive: "success", destructive: "danger",
};

/** Rol del color según la propiedad CSS que lo recibe (mirando hacia atrás en la línea). */
export function roleAt(line, index) {
  const before = line.slice(0, index).replace(/\$\{/g, "  ");
  const cut = Math.max(before.lastIndexOf(","), before.lastIndexOf("{"));
  const m = /^\s*([A-Za-z]+)\s*:/.exec(before.slice(cut + 1));
  const prop = m ? m[1] : "";
  if (/^(background|backgroundColor)$/.test(prop)) return "fill";
  if (/^(border|outline)/.test(prop)) return "control";
  return "text";
}

export function mapRef(key, role, zone) {
  if (key === "berry") return role === "fill" || zone === "admin" ? "ink" : "accentStrong";
  if (key === "sandstone") return role === "fill" ? "line" : role === "control" ? "lineStrong" : "inkMuted";
  const out = REF_BASE[key];
  if (!out) throw new Error(`Clave de ALMA sin mapeo: ${key}`);
  return out;
}

export const transformRefs = (src, zone) =>
  src
    .split("\n")
    .map((line) => line.replace(/\bALMA\.([A-Za-z]+)\b/g, (_, key, idx) => `COLOR.${mapRef(key, roleAt(line, idx), zone)}`))
    .join("\n");

/* ── Tonos pasados por nombre de color ──────────────────────────────── */
const LEGACY_TONE = {
  berry: "accent", olive: "success", destructive: "danger", stone: "muted", coral: "muted",
  sandstone: "muted", blush: "muted", mist: "muted", cream: "muted", border: "muted", ink: "ink", inkDeep: "ink",
};
const toTone = (val) => (LEGACY_TONE[val] && LEGACY_TONE[val] !== val ? LEGACY_TONE[val] : val);

export const transformTones = (src) =>
  src
    .replace(/\b(tone|tint|iconTint)(=|:\s?)"([A-Za-z]+)"/g, (_, attr, sep, val) => `${attr}${sep}"${toTone(val)}"`)
    // Expresiones: tone={cond ? "destructive" : "berry"}, tint={MAP[x] ?? "berry"}
    .replace(/\b(tone|tint|iconTint)=\{([^{}]*)\}/g, (_, attr, expr) =>
      `${attr}={${expr.replace(/"([A-Za-z]+)"/g, (__, val) => `"${toTone(val)}"`)}}`);

/** `keyof typeof ALMA` → `ToneInput`; en un Record<…, keyof typeof ALMA> los valores también son tonos. */
export const transformToneTypes = (src) =>
  src
    .replace(/(Record<string,\s*keyof typeof ALMA>\s*=\s*\{)([^}]*)\}/g, (_, head, body) =>
      `${head}${body.replace(/:\s?"([A-Za-z]+)"/g, (full, val) => full.replace(`"${val}"`, `"${toTone(val)}"`))}}`)
    .replace(/\bkeyof typeof ALMA\b/g, "ToneInput");

/* ── Fuentes y movimiento ───────────────────────────────────────────── */
export const transformFonts = (src) =>
  src
    .replace(/\bfont-display-italic\b/g, "font-display")
    .replace(/\bfont-(bebas|gulfs)\b/g, "font-display")
    .replace(/\bfont-(syne|dm|alilato)\b/g, "font-sans");

export const transformMotion = (src) => src.replace(/--ease-alma-(out|in-out|drawer)\b/g, "--ease-$1");

/* ── Imports ────────────────────────────────────────────────────────── */
const SOURCES = new Set(["@/components/app/tokens", "@/components/app/AppShell", "@/components/auth/AuthShell"]);
const IMPORT_RE = /import\s*\{([^}]*)\}\s*from\s*"([^"]+)";?/g;
const DESIGN_IMPORT_RE = /import\s*\{([^}]*)\}\s*from\s*"@\/design\/tokens";?/;

export function transformImports(src) {
  let out = src.replace(IMPORT_RE, (full, names, from) => {
    if (!SOURCES.has(from)) return full;
    const kept = names.split(",").map((n) => n.trim()).filter(Boolean)
      .filter((n) => n !== "ALMA" && n !== "type AlmaTone" && n !== "AlmaTone");
    if (kept.length === names.split(",").map((n) => n.trim()).filter(Boolean).length) return full;
    if (kept.length === 0) return "";
    return names.includes("\n")
      ? `import {\n  ${kept.join(",\n  ")},\n} from "${from}";`
      : `import { ${kept.join(", ")} } from "${from}";`;
  });
  // La reexportación de AppShell/AuthShell, con el comentario que la documenta.
  out = out.replace(/(?:\/\*(?:[^*]|\*(?!\/))*\*\/\n)?[ \t]*export \{ ALMA \};[ \t]*\n/, "");
  out = out.replace(/^\n+/, "");
  out = out.replace(/\bAlmaTone\b/g, "ToneInput");

  const wanted = [];
  if (/\bCOLOR\./.test(out)) wanted.push("COLOR");
  if (/\bToneInput\b/.test(out)) wanted.push("type ToneInput");
  if (wanted.length === 0) return out;

  const existing = DESIGN_IMPORT_RE.exec(out);
  if (existing) {
    const have = existing[1].split(",").map((n) => n.trim()).filter(Boolean);
    const missing = wanted.filter((w) => !have.includes(w));
    if (missing.length === 0) return out;
    return out.replace(DESIGN_IMPORT_RE, `import { ${[...have, ...missing].join(", ")} } from "@/design/tokens";`);
  }
  const imports = [...out.matchAll(/^import\s[\s\S]*?from\s+"[^"]+";?[ \t]*$|^import\s+"[^"]+";?[ \t]*$/gm)];
  const line = `import { ${wanted.join(", ")} } from "@/design/tokens";`;
  if (imports.length === 0) return `${line}\n${out}`;
  const last = imports[imports.length - 1];
  const at = last.index + last[0].length;
  return `${out.slice(0, at)}\n${line}${out.slice(at)}`;
}

/* ── Orquestación ───────────────────────────────────────────────────── */
export function transform(src, file) {
  const zone = zoneOf(file);
  let out = transformToneTypes(src);
  out = transformTones(out);
  out = transformRefs(out, zone);
  out = transformClasses(out, zone);
  out = transformFonts(out);
  out = transformMotion(out);
  out = transformImports(out);
  return out;
}

function main() {
  const dry = process.argv.includes("--dry");
  const files = execSync("git ls-files 'src/**/*.ts' 'src/**/*.tsx'", { encoding: "utf8" })
    .split("\n").filter(Boolean)
    .filter((f) => !/\.test\.(ts|tsx)$/.test(f))
    .filter((f) => !f.startsWith("src/design/"))
    .filter((f) => f !== "src/components/app/tokens.ts");
  let changed = 0;
  for (const f of files) {
    const src = fs.readFileSync(f, "utf8");
    const out = transform(src, f);
    if (out !== src) {
      changed++;
      if (!dry) fs.writeFileSync(f, out);
      console.log(`  ${dry ? "(dry) " : ""}${f}`);
    }
  }
  // index.css sólo necesita el cambio de curvas de movimiento.
  const css = fs.readFileSync("src/index.css", "utf8");
  const cssOut = transformMotion(css);
  if (cssOut !== css && !dry) fs.writeFileSync("src/index.css", cssOut);
  console.log(`archivos modificados: ${changed}${cssOut !== css ? " + src/index.css" : ""}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
