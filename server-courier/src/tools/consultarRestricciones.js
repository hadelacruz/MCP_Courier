import { readDb } from "../db/db.js";

export const consultarRestricciones = {
  name: "consultar_restricciones",
  description:
    "Indica si una categoría de producto es permitida, restringida o prohibida para importar por casillero, y qué requisitos aplican.",
  inputSchema: {
    type: "object",
    properties: {
      categoria: {
        type: "string",
        description:
          'Categoría del producto, por ejemplo "electronica", "ropa", "cosmeticos", "medicamentos", "armas".',
      },
    },
    required: ["categoria"],
  },
  handler: async ({ categoria }) => {
    const db = readDb();
    const normalized = String(categoria).trim().toLowerCase();
    const entry = db.restricciones.find((r) => r.categoria === normalized);

    if (!entry) {
      return {
        categoria: normalized,
        estado: "desconocido",
        requisitos:
          "No se encontró esta categoría en el catálogo. Se recomienda consultar con servicio al cliente antes de comprar.",
      };
    }

    return {
      categoria: entry.categoria,
      estado: entry.estado,
      requisitos: entry.requisitos,
    };
  },
};
