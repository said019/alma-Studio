# Alma Movement Design Context

Dirección (confirmada por la dueña): **lujo cálido terroso estilo Frame Pilates Lab** — editorial, monocromático cálido, serif protagonista, fotografía full-bleed, mucha calma y restraint. Crema nude + profundidad espresso + acentos taupe cálido. SIN pop rosa/berry (eso era la dirección Femmé, descartada). El lujo viene de la restricción, el serif y la fotografía, no de un color de acento brillante.

## Palette (OKLCH, neutros tintados hacia el cálido; nunca #000 ni #fff)

Estrategia: **Committed** — el berry/vino es la firma; el canvas nude domina; el espresso da profundidad en secciones "drenched".

- **Canvas** `#FAF7F2` — crema nude cálido, fondo principal y aire.
- **Ink** `#2A1E1B` — espresso profundo. Texto y secciones oscuras full-bleed (estilo footer Frame).
- **Berry** `#76214D` — vino, el acento de firma (CTAs, detalles editoriales). Sofisticado, femenino, distingue de rosa boutique.
- **Clay** `#C08368` — terracota cálida, secundario suave (no el coral brillante viejo).
- **Sand** `#E7DACB` — taupe/arena, superficies neutras y divisores.
- **Blush** `#F4E4DD` — tinte suave para bloques cálidos ligeros.
- **Olive** `#778455` — verde tierra, uso puntual (naturaleza/calma), discreto.

Mutar el naranja/coral saturados viejos: la sensación es relajante y premium, no energética-gym.

## Typography

- **Display / titulares**: serif editorial cálido y de alto contraste (preferir **Fraunces**, variable, con optical sizing y peso alto). Da el aire "lujo editorial" de Frame. Titulares grandes, generosos, line-height apretado.
- **Body / UI**: sans humanista limpio (Jost o el actual), 16px+, line-length 65–75ch.
- Números (precios, cupos, vigencias) con tabular-nums.
- Contraste de jerarquía ≥1.25 entre pasos; evitar escalas planas.

## Layout

- Heroes y secciones **image-led full-bleed** con texto serif sobrepuesto (Frame).
- Asimetría editorial intencional; ritmo de espaciado variable (no padding uniforme).
- Alternar secciones claras (canvas/blush) con secciones **drenched** oscuras (Ink) para contraste y respiro.
- Evitar tarjetas; nunca tarjetas anidadas. Componentes enmarcados solo para herramientas concretas (wallet, paquetes).
- Catálogo de paquetes como lista editorial por mundo (Studio / Reformer-Tower / Mixtos / Premium), no rejilla de tarjetas idénticas.

## Components

- CTAs principales: botones pill con borde fino o sólidos berry/ink, con micro-interacción.
- Iconografía: lucide-react ya presente; uso discreto.
- Fotografía real del estudio (Reformer, Tower, tapete, comunidad) como protagonista; tratamiento cálido y consistente.

## Motion (filosofía Emil Kowalski)

- Solo transform y opacity (nunca propiedades de layout).
- Ease-out exponencial (quart/quint/expo); sin bounce ni elastic.
- Scroll reveals sutiles (fade + translate corto), stagger ligero.
- Micro-interacciones con propósito (hover de CTAs, imágenes con parallax/scale muy sutil).
- Respetar `prefers-reduced-motion`. El movimiento se siente vivo pero nunca ruidoso.
