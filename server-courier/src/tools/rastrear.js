import { readDb } from "../db/db.js";

export const rastrear = {
  name: "rastrear",
  description: "Devuelve el estado actual y el historial de eventos de un paquete, dado su número de guía.",
  inputSchema: {
    type: "object",
    properties: {
      guia: { type: "string", description: "Número de guía del paquete, por ejemplo GTC-XXXXX." },
    },
    required: ["guia"],
  },
  handler: async ({ guia }) => {
    const db = readDb();
    const paquete = db.paquetes.find((p) => p.guia === guia);

    if (!paquete) {
      throw new Error(`No se encontró ningún paquete con la guía "${guia}".`);
    }

    return paquete;
  },
};
