import { readDb } from "../db/db.js";
import { calcularDaiValores } from "./calcularDai.js";

function round2(n) {
  return Math.round(n * 100) / 100;
}

function tiempoEstimadoDias(estadoRestriccion) {
  if (estadoRestriccion === "restringido") return "10-15 días hábiles (requiere trámite adicional)";
  return "5-7 días hábiles";
}

export const cotizarImportacion = {
  name: "cotizar_importacion",
  description:
    "Entrega el costo total desglosado de traer un producto a Guatemala: verifica restricciones, calcula flete según peso, manejo, impuestos (DAI + IVA) y tiempo estimado de entrega.",
  inputSchema: {
    type: "object",
    properties: {
      valorDeclarado: { type: "number", description: "Valor declarado del producto en USD.", minimum: 0 },
      pesoLb: { type: "number", description: "Peso del paquete en libras.", minimum: 0.1 },
      categoria: { type: "string", description: 'Categoría del producto, por ejemplo "electronica", "ropa".' },
    },
    required: ["valorDeclarado", "pesoLb", "categoria"],
  },
  handler: async ({ valorDeclarado, pesoLb, categoria }) => {
    const db = readDb();
    const normalized = String(categoria).trim().toLowerCase();
    const restriccion = db.restricciones.find((r) => r.categoria === normalized);

    if (restriccion?.estado === "prohibido") {
      return {
        categoria: normalized,
        estado: "prohibido",
        requisitos: restriccion.requisitos,
        mensaje: "Este producto no se puede cotizar porque su importación está prohibida por casillero.",
      };
    }

    const { costoPorLibra, cargoMinimo, manejoFijo } = db.tarifarioFlete;
    const flete = round2(Math.max(cargoMinimo, pesoLb * costoPorLibra));
    const manejo = manejoFijo;
    const impuestos = calcularDaiValores(db, valorDeclarado, categoria);
    const totalAPagarEnGuatemala = round2(flete + manejo + impuestos.totalImpuestos);

    return {
      categoria: impuestos.categoria,
      estadoRestriccion: restriccion?.estado ?? "permitido",
      requisitos: restriccion?.requisitos ?? null,
      valorDeclarado: impuestos.valorDeclarado,
      pesoLb,
      desglose: {
        flete,
        manejo,
        dai: impuestos.dai,
        iva: impuestos.iva,
      },
      totalAPagarEnGuatemala,
      tiempoEstimado: tiempoEstimadoDias(restriccion?.estado),
    };
  },
};
