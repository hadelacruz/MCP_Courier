import { readDb, writeDb, generateGuia } from "../db/db.js";

export const registrarPaquete = {
  name: "registrar_paquete",
  description:
    "Registra un paquete en el casillero del cliente y genera su número de guía.",
  inputSchema: {
    type: "object",
    properties: {
      cliente: { type: "string", description: "Nombre del cliente dueño del casillero." },
      descripcion: { type: "string", description: "Descripción del contenido del paquete." },
      pesoLb: { type: "number", description: "Peso del paquete en libras.", minimum: 0.1 },
      valorDeclarado: { type: "number", description: "Valor declarado en USD.", minimum: 0 },
      categoria: { type: "string", description: "Categoría del producto." },
    },
    required: ["cliente", "descripcion", "pesoLb", "valorDeclarado", "categoria"],
  },
  handler: async ({ cliente, descripcion, pesoLb, valorDeclarado, categoria }) => {
    const db = readDb();
    const guia = generateGuia();
    const fecha = new Date().toISOString();

    const paquete = {
      guia,
      cliente,
      descripcion,
      pesoLb,
      valorDeclarado,
      categoria: String(categoria).trim().toLowerCase(),
      estado: "Recibido en bodega Miami",
      historial: [{ fecha, evento: "Paquete recibido en bodega Miami" }],
    };

    db.paquetes.push(paquete);
    writeDb(db);

    return paquete;
  },
};
