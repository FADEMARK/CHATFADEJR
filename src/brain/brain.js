/*
 * =========================================================
 * CHATFADE JR
 * BRAIN CORE
 * Version 0.7.3
 * =========================================================
 */

import { ollamaProvider } from "./providers/ollama.js";

export class ChatFadeBrain {

  constructor() {
    this.name = "CHATFADE JR Brain";
    this.version = "0.7.3";
    this.provider = ollamaProvider;
  }


  /*
   * =======================================================
   * SYSTEM PROMPT
   * =======================================================
   */

  buildSystemPrompt({
    user,
    memories = []
  }) {

    const memoryText =
      memories.length > 0
        ? memories
            .map(memory => {
              return `- ${memory.memory_key}: ${memory.memory_value}`;
            })
            .join("\n")
        : "- No hay recuerdos permanentes disponibles todavía.";


    return `
Eres CHATFADE JR.

Tu identidad:
- Tu nombre es CHATFADE JR.
- Eres un asistente digital independiente desarrollado como parte del ecosistema FADE.
- No debes decir que eres Qwen, Alibaba, OpenAI, ChatGPT, Claude ni Gemini.
- El modelo de lenguaje es solamente tu motor interno.
- Tú eres CHATFADE JR.

Tu estilo:
- Responde en español si el usuario habla español.
- Sé natural, claro y conversacional.
- No repitas constantemente tu nombre.
- No inventes datos.
- No inventes recuerdos.
- Si no sabes algo, dilo claramente.
- Usa el historial y la memoria cuando sean relevantes.
- No digas que "guardaste" algo a menos que el sistema realmente lo haya guardado.
- No menciones detalles técnicos internos salvo que el usuario los pregunte.

Usuario actual:
- Nombre: ${user?.name || "desconocido"}
- Correo: ${user?.email || "desconocido"}

Memoria permanente disponible:
${memoryText}

IMPORTANTE:
Los recuerdos anteriores son información suministrada previamente por el usuario.
Úsalos solo cuando ayuden a responder la pregunta actual.
`;
  }


  /*
   * =======================================================
   * LIMPIAR HISTORIAL
   * =======================================================
   */

  prepareHistory(history = []) {

    /*
     * Render Free tiene poca RAM.
     *
     * Por ahora mandamos únicamente
     * los últimos 10 mensajes.
     */

    return history
      .slice(-10)
      .map(message => ({
        role:
          message.role === "assistant"
            ? "assistant"
            : "user",

        content:
          String(message.content)
      }));

  }


  /*
   * =======================================================
   * RESPONDER
   * =======================================================
   */

  async respond({
    user,
    message,
    history = [],
    memories = []
  }) {

    /*
     * Provider no configurado.
     *
     * Dejamos fallback local
     * para que CHATFADE JR
     * no se caiga completamente.
     */

    if (
      !this.provider ||
      !this.provider.isConfigured()
    ) {

      return {
        text:
          `Estoy funcionando en modo local, ${user?.name || "usuario"}. ` +
          `Recibí tu mensaje: "${message}"`,

        provider: "local-fallback",
        model: null
      };

    }


    try {

      const systemPrompt =
        this.buildSystemPrompt({
          user,
          memories
        });


      const preparedHistory =
        this.prepareHistory(
          history
        );


      /*
       * Evitar duplicar el mensaje actual.
       *
       * En server.js el mensaje del usuario
       * ya fue guardado antes de llamar
       * al Brain.
       */

      const lastMessage =
        preparedHistory[
          preparedHistory.length - 1
        ];


      if (
        !lastMessage ||
        lastMessage.role !== "user" ||
        lastMessage.content !== message
      ) {

        preparedHistory.push({
          role: "user",
          content: message
        });

      }


      const result =
        await this.provider.generate({

          systemPrompt,

          messages:
            preparedHistory,

          temperature:
            0.6

        });


      return {
        text:
          result.text,

        provider:
          result.provider,

        model:
          result.model,

        totalDuration:
          result.totalDuration || null,

        evalCount:
          result.evalCount || null
      };


    } catch (error) {

      console.error(
        "CHATFADE Brain Error:",
        error
      );


      /*
       * Si Ollama falla,
       * CHATFADE JR sigue vivo.
       */

      return {

        text:
          `Estoy teniendo dificultades para acceder a mi motor de lenguaje en este momento. ` +
          `Pero sigo conectado y conservo nuestra conversación.`,

        provider:
          "error-fallback",

        model:
          null,

        error:
          error.message

      };

    }

  }

}


/*
 * =========================================================
 * INSTANCIA PRINCIPAL
 * =========================================================
 */

export const brain =
  new ChatFadeBrain();
