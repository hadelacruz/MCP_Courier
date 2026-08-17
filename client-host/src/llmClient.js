// Drives the tool-use loop against an OpenAI-compatible chat completions API
// (works with OpenAI itself and with compatible gateways/proxies — this
// project points it at tokenrouter.com serving Qwen). Converts MCP's tool
// shape {name, description, inputSchema} into OpenAI's function-calling
// shape, and turns tool_calls in the response into MCP tools/call requests.
import OpenAI from "openai";
import { getHistory } from "./sessionManager.js";

const MODEL = process.env.LLM_MODEL;
const MAX_TOOL_ROUNDTRIPS = 8;

const SYSTEM_PROMPT = `Eres el asistente virtual de un courier de importación entre Estados Unidos y Guatemala.
Ayudas a clientes a entender restricciones de importación, calcular impuestos, cotizar el costo total
de traer un producto, registrar paquetes en su casillero y rastrearlos.

Usa las herramientas disponibles para responder con datos reales en vez de inventar cifras. Si una
pregunta requiere varios datos (por ejemplo una cotización completa), encadena las herramientas que
necesites antes de responder. Responde siempre en español, de forma clara y con el desglose de costos
cuando aplique.`;

function toOpenAiTool(mcpTool) {
  return {
    type: "function",
    function: {
      name: mcpTool.name,
      description: mcpTool.description,
      parameters: mcpTool.inputSchema,
    },
  };
}

export function createChatEngine({ mcpManager, apiKey, baseURL }) {
  const client = new OpenAI({
    apiKey: apiKey ?? process.env.LLM_API_KEY,
    baseURL: baseURL ?? process.env.LLM_BASE_URL,
  });

  async function chat(sessionId, userText) {
    const history = getHistory(sessionId);
    history.push({ role: "user", content: userText });

    const mcpTools = await mcpManager.getToolDefinitions();
    const tools = mcpTools.map(toOpenAiTool);

    for (let round = 0; round < MAX_TOOL_ROUNDTRIPS; round++) {
      const response = await client.chat.completions.create({
        model: MODEL,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...history],
        tools,
      });

      const message = response.choices[0].message;
      history.push(message);

      if (!message.tool_calls || message.tool_calls.length === 0) {
        return message.content ?? "";
      }

      for (const toolCall of message.tool_calls) {
        let resultText;
        try {
          const args = JSON.parse(toolCall.function.arguments || "{}");
          const toolResult = await mcpManager.callTool(toolCall.function.name, args);
          resultText = toolResult.content?.map((c) => c.text).join("\n") ?? JSON.stringify(toolResult);
        } catch (err) {
          resultText = `Error invocando la herramienta "${toolCall.function.name}": ${err.message}`;
        }

        history.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: resultText,
        });
      }
    }

    return "No se pudo completar la solicitud tras encadenar varias herramientas. Intenta reformular tu pregunta.";
  }

  return { chat };
}
