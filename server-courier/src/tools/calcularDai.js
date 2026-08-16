import { readDb } from "../db/db.js";

export function calcularDaiValores(db, valorDeclarado, categoria) {
  const normalized = String(categoria).trim().toLowerCase();
  const entry = db.aranceles.find((a) => a.categoria === normalized) ??
    db.aranceles.find((a) => a.categoria === "otros");

  const arancelPct = entry.arancelPct;
  const dai = round2((valorDeclarado * arancelPct) / 100);
  const baseIva = valorDeclarado + dai;
  const iva = round2((baseIva * db.ivaPct) / 100);
  const totalImpuestos = round2(dai + iva);

  return {
    categoria: entry.categoria,
    valorDeclarado: round2(valorDeclarado),
    arancelPct,
    dai,
    ivaPct: db.ivaPct,
    iva,
    totalImpuestos,
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

export const calcularDai = {
  name: "calcular_dai",
  description:
    "Calcula los impuestos de importación (arancel/DAI e IVA) sobre el valor declarado de un producto, según su categoría.",
  inputSchema: {
    type: "object",
    properties: {
      valorDeclarado: {
        type: "number",
        description: "Valor declarado del producto en USD.",
        minimum: 0,
      },
      categoria: {
        type: "string",
        description: 'Categoría del producto, por ejemplo "electronica", "ropa".',
      },
    },
    required: ["valorDeclarado", "categoria"],
  },
  handler: async ({ valorDeclarado, categoria }) => {
    const db = readDb();
    return calcularDaiValores(db, valorDeclarado, categoria);
  },
};
