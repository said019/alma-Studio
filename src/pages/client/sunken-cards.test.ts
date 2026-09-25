import { describe, it, expect } from "vitest";
import { read, lineasCon } from "@/design/zoneGuard";

/* En oscuro sunken (#171412) casi no se separa del canvas (#141210): las
   tarjetas hundidas llevan borde line para no perderse. El fondo no cambia. */
const TARJETA_HUNDIDA = /\brounded-(?:2xl|3xl)\b(?=.*(?<![:\w-])bg-sunken\b)(?=.*(?<![\w-])p-\d)/;

const TARJETAS: [string, number][] = [
  ["src/pages/client/Checkout.tsx", 6],
  ["src/pages/client/Profile.tsx", 1],
  ["src/pages/client/Responsiva.tsx", 1],
  ["src/pages/client/ProfileMembership.tsx", 1],
  ["src/pages/client/OrderDetail.tsx", 1],
  ["src/pages/client/WalletRewards.tsx", 1],
];

describe.each(TARJETAS)("tarjetas bg-sunken de %s", (f, n) => {
  const src = read(f);
  it(`son ${n} y todas llevan border border-line`, () => {
    expect(lineasCon(src, (l) => TARJETA_HUNDIDA.test(l))).toHaveLength(n);
    expect(lineasCon(src, (l) => TARJETA_HUNDIDA.test(l) && !/(?<![:\w-])border border-line(?![\w-])/.test(l))).toEqual([]);
  });
});
