import { readDb } from "../db/db.js";

export const listarSucursales = {
  name: "listar_sucursales",
  description: "Consulta las sucursales de entrega disponibles, opcionalmente filtradas por departamento.",
  inputSchema: {
    type: "object",
    properties: {
      departamento: {
        type: "string",
        description: "Departamento de Guatemala a filtrar, por ejemplo \"Guatemala\", \"Quetzaltenango\". Si se omite, devuelve todas.",
      },
    },
    required: [],
  },
  handler: async ({ departamento } = {}) => {
    const db = readDb();
    if (!departamento) return db.sucursales;

    const normalized = departamento.trim().toLowerCase();
    return db.sucursales.filter((s) => s.departamento.toLowerCase() === normalized);
  },
};
