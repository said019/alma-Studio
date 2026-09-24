import { test } from "node:test";
import assert from "node:assert/strict";
import {
  zoneOf, mapClassColor, transformClasses, roleAt, transformRefs, transformToneTypes,
  transformTones, transformFonts, transformMotion, transformImports, transform,
} from "./hive-tokens.mjs";

test("zona por ruta", () => {
  assert.equal(zoneOf("src/pages/admin/Dashboard.tsx"), "admin");
  assert.equal(zoneOf("src/components/admin/AdminLayout.tsx"), "admin");
  assert.equal(zoneOf("src/pages/client/Wallet.tsx"), "app");
  assert.equal(zoneOf("src/pages/Index.tsx"), "app");
});

test("sandstone según el prefijo", () => {
  assert.equal(mapClassColor("border", "sandstone", "app"), "line-strong");
  assert.equal(mapClassColor("ring", "sandstone", "app"), "line-strong");
  assert.equal(mapClassColor("text", "sandstone", "app"), "ink-muted");
  assert.equal(mapClassColor("bg", "sandstone", "app"), "line");
  assert.equal(mapClassColor("divide", "sandstone", "app"), "line");
});

test("berry: relleno negro; texto coral profundo en la app y negro en el panel", () => {
  assert.equal(mapClassColor("bg", "berry", "app"), "ink");
  assert.equal(mapClassColor("text", "berry", "app"), "accent-strong");
  assert.equal(mapClassColor("text", "berry", "admin"), "ink");
});

test("un color sin mapeo detiene la migración", () => {
  assert.throws(() => mapClassColor("bg", "lavanda", "app"));
});

test("clases con variantes y opacidad", () => {
  const src = 'className="bg-alma-oat hover:bg-alma-oat/40 text-alma-ink/45 border-alma-hairline bg-alma-ink-deep focus-visible:ring-offset-alma-canvas"';
  assert.equal(
    transformClasses(src, "admin"),
    'className="bg-sunken hover:bg-sunken/40 text-ink/45 border-line bg-inverse focus-visible:ring-offset-canvas"',
  );
});

test("rol por la propiedad CSS, incluidos ternarios y plantillas", () => {
  const l1 = "style={{ backgroundColor: active ? ALMA.berry : \"transparent\", color: active ? ALMA.cream : ALMA.ink }}";
  assert.equal(roleAt(l1, l1.indexOf("ALMA.berry")), "fill");
  assert.equal(roleAt(l1, l1.lastIndexOf("ALMA.ink")), "text");
  const l2 = "style={{ border: `1px solid ${ALMA.sandstone}` }}";
  assert.equal(roleAt(l2, l2.indexOf("ALMA.sandstone")), "control");
  const l3 = "<Check color={ALMA.berry} />";
  assert.equal(roleAt(l3, l3.indexOf("ALMA.berry")), "text");
});

test("referencias ALMA.* según rol y zona", () => {
  const src = "style={{ backgroundColor: ALMA.berry, color: ALMA.cream, borderTop: `1px solid ${ALMA.border}` }}";
  assert.equal(
    transformRefs(src, "app"),
    "style={{ backgroundColor: COLOR.ink, color: COLOR.canvas, borderTop: `1px solid ${COLOR.line}` }}",
  );
  assert.equal(transformRefs("color: ALMA.berry", "app"), "color: COLOR.accentStrong");
  assert.equal(transformRefs("color: ALMA.berry", "admin"), "color: COLOR.ink");
  assert.equal(transformRefs("color: `${ALMA.ink}8c`", "app"), "color: `${COLOR.ink}8c`");
  assert.equal(transformRefs("color: ALMA.coral", "app"), "color: COLOR.inkMuted"); // era beige
});

test("tonos con nombres de Alma", () => {
  assert.equal(transformTones('<StatusPill tone="olive" />'), '<StatusPill tone="success" />');
  assert.equal(transformTones('{ label: "x", tone: "destructive" }'), '{ label: "x", tone: "danger" }');
  assert.equal(transformTones('<ListRow iconTint="berry" />'), '<ListRow iconTint="accent" />');
  assert.equal(transformTones('<Tag tint="stone">'), '<Tag tint="muted">');
  assert.equal(transformTones('<Tag tint="ink">'), '<Tag tint="ink">');
  // Ternarios y valores por defecto dentro de una expresión
  assert.equal(
    transformTones('<StatusPill tone={m.status === "active" ? "destructive" : "berry"} />'),
    '<StatusPill tone={m.status === "active" ? "danger" : "accent"} />',
  );
  assert.equal(transformTones('<Tag tint={MAP[b.status] ?? "berry"}>'), '<Tag tint={MAP[b.status] ?? "accent"}>');
});

test("tipos y mapas de tono declarados con el objeto ALMA", () => {
  // MyBookings: los valores de un Record<…, keyof typeof ALMA> también son tonos.
  const src = 'const T: Record<string, keyof typeof ALMA> = {\n  confirmed: "olive",\n  cancelled: "ink",\n};\nconst S: Record<string, { tone: keyof typeof ALMA }> = {};\n';
  assert.equal(
    transformToneTypes(src),
    'const T: Record<string, ToneInput> = {\n  confirmed: "success",\n  cancelled: "ink",\n};\nconst S: Record<string, { tone: ToneInput }> = {};\n',
  );
});

test("fuentes y curvas de movimiento", () => {
  assert.equal(transformFonts("font-display-italic font-bebas font-alilato font-display"), "font-display font-display font-sans font-display");
  assert.equal(transformMotion("ease-[var(--ease-alma-out)] var(--ease-alma-drawer)"), "ease-[var(--ease-out)] var(--ease-drawer)");
});

test("imports: de una línea, de varias líneas y reexportación", () => {
  const una = 'import { ALMA } from "@/components/app/tokens";\nconst x = COLOR.ink;\n';
  assert.equal(transformImports(una), '\nimport { COLOR } from "@/design/tokens";\nconst x = COLOR.ink;\n'.replace(/^\n/, ""));

  const varias = 'import {\n  AppShell,\n  ALMA,\n  PageHeader,\n} from "@/components/app/AppShell";\nconst c = COLOR.ink;\n';
  const out = transformImports(varias);
  assert.match(out, /import \{\n  AppShell,\n  PageHeader,\n\} from "@\/components\/app\/AppShell";/);
  assert.match(out, /import \{ COLOR \} from "@\/design\/tokens";/);
  assert.doesNotMatch(out, /\bALMA\b/);

  // AuthShell: la reexportación lleva un comentario encima que también debe irse.
  const reexp = 'import { ALMA } from "@/components/app/tokens";\n\n/* Paleta canónica re-exportada: las páginas\n   importan ALMA desde aquí. */\nexport { ALMA };\nconst c = COLOR.ink;\n';
  const sinReexp = transformImports(reexp);
  assert.doesNotMatch(sinReexp, /export \{ ALMA \}/);
  assert.doesNotMatch(sinReexp, /\bALMA\b/);
});

test("imports: un tipo de tono agrega `type ToneInput`", () => {
  const src = 'import { AppShell, ALMA } from "@/components/app/AppShell";\nconst S: Record<string, { tone: ToneInput }> = {};\n';
  assert.match(transformImports(src), /import \{ type ToneInput \} from "@\/design\/tokens";/);
});

test("imports: se suma a un import existente de @/design/tokens", () => {
  const src = 'import { ALMA } from "@/components/app/tokens";\nimport { resolveTone } from "@/design/tokens";\nconst c = COLOR.ink;\n';
  const out = transformImports(src);
  assert.match(out, /import \{ resolveTone, COLOR \} from "@\/design\/tokens";/);
  assert.equal((out.match(/@\/design\/tokens/g) ?? []).length, 1);
});

test("transform completo es idempotente", () => {
  const src = 'import { ALMA } from "@/components/app/tokens";\nconst A = () => <p className="text-alma-berry" style={{ color: ALMA.ink }} />;\n';
  const una = transform(src, "src/pages/client/X.tsx");
  assert.equal(transform(una, "src/pages/client/X.tsx"), una);
  assert.doesNotMatch(una, /ALMA|alma-/);
});
