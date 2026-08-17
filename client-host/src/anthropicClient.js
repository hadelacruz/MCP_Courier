// Drives the tool-use loop against the Anthropic Messages API: sends the
// conversation + the MCP tools list, and whenever Claude answers with
// tool_use blocks, invokes them through mcpManager and feeds the results
// back until Claude produces a final text answer.
import Anthropic from "@anthropic-ai/sdk";
import { getHistory } from "./sessionManager.js";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";
const MAX_TOOL_ROUNDTRIPS = 8;

const SYSTEM_PROMPT = `Eres el asistente virtual de un courier de importación entre Estados Unidos y Guatemala.
Ayudas a clientes a entender restricciones de importación, calcular impuestos, cotizar el costo total
de traer un producto, registrar paquetes en su casillero y rastrearlos.

Usa las herramientas disponibles para responder con datos reales en vez de inventar cifras. Si una
pregunta requiere varios datos (por ejemplo una cotización completa), encadena las herramientas que
necesites antes de responder. Responde siempre en español, de forma clara y con el desglose de costos
cuando aplique.`;

export function createChatEngine({ mcpManager, anthropicApiKey }) {
  const anthropic = new Anthropic({ apiKey: anthropicApiKey ?? process.env.ANTHROPIC_API_KEY });

  async function chat(sessionId, userText) {
    const history = getHistory(sessionId);
    history.push({ role: "user", content: userText });

    const tools = await mcpManager.getAnthropicTools();

    for (let round = 0; round < MAX_TOOL_ROUNDTRIPS; round++) {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools,
        messages: history,
      });

      history.push({ role: "assistant", content: response.content });

      if (response.stop_reason !== "tool_use") {
        return extractText(response.content);
      }

      const toolResults = [];
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;

        let resultText;
        let isError = false;
        try {
          const toolResult = await mcpManager.callTool(block.name, block.input);
          resultText = toolResult.content?.map((c) => c.text).join("\n") ?? JSON.stringify(toolResult);
          isError = !!toolResult.isError;
        } catch (err) {
          resultText = `Error invocando la herramienta "${block.name}": ${err.message}`;
          isError = true;
        }

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: resultText,
          is_error: isError,
        });
      }
      history.push({ role: "user", content: toolResults });
    }

    return "No se pudo completar la solicitud tras encadenar varias herramientas. Intenta reformular tu pregunta.";
  }

  return { chat };
}

function extractText(content) {
  return content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}
