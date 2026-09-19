/*
 * =========================================================
 * CHATFADE JR
 * OpenAI-Compatible Provider
 * Version 0.7.1
 * =========================================================
 *
 * Este provider permite conectar CHATFADE JR
 * a cualquier servidor/modelo que implemente
 * una API compatible con /v1/chat/completions.
 *
 * No obliga a utilizar OpenAI.
 * =========================================================
 */

export class OpenAICompatibleProvider {

  constructor(options = {}) {

    this.name =
      options.name ||
      "OpenAI-Compatible";

    this.baseURL =
      options.baseURL ||
      process.env.BRAIN_BASE_URL;

    this.apiKey =
      options.apiKey ||
      process.env.BRAIN_API_KEY;

    this.model =
      options.model ||
      process.env.BRAIN_MODEL;

  }


  /*
   * =======================================================
   * VERIFICAR CONFIGURACION
   * =======================================================
   */

  isConfigured() {

    return Boolean(
      this.baseURL &&
      this.model
    );

  }


  /*
   * =======================================================
   * GENERAR RESPUESTA
   * =======================================================
   */

  async generate({
    systemPrompt,
    messages = [],
    temperature = 0.7,
    maxTokens = 500
  }) {

    if (!this.isConfigured()) {

      throw new Error(
        "El provider de CHATFADE JR no está configurado."
      );

    }


    const url =
      `${this.baseURL.replace(/\/$/, "")}/chat/completions`;


    const headers = {
      "Content-Type":
        "application/json"
    };


    /*
     * Algunos servidores locales
     * no necesitan API key.
     */

    if (this.apiKey) {

      headers.Authorization =
        `Bearer ${this.apiKey}`;

    }


    const requestMessages = [];


    /*
     * SYSTEM PROMPT
     */

    if (systemPrompt) {

      requestMessages.push({
        role: "system",
        content: systemPrompt
      });

    }


    /*
     * HISTORIAL
     */

    for (const message of messages) {

      if (
        !message ||
        !message.content
      ) {
        continue;
      }


      const role =
        message.role === "assistant"
          ? "assistant"
          : "user";


      requestMessages.push({
        role,
        content:
          String(message.content)
      });

    }


    /*
     * REQUEST
     */

    const response =
      await fetch(
        url,
        {
          method: "POST",

          headers,

          body:
            JSON.stringify({

              model:
                this.model,

              messages:
                requestMessages,

              temperature,

              max_tokens:
                maxTokens

            })
        }
      );


    /*
     * ERROR HTTP
     */

    if (!response.ok) {

      const errorText =
        await response.text();

      throw new Error(
        `Brain Provider HTTP ${response.status}: ${errorText}`
      );

    }


    /*
     * RESPUESTA JSON
     */

    const data =
      await response.json();


    const text =
      data?.choices?.[0]
        ?.message?.content;


    if (!text) {

      throw new Error(
        "El modelo no devolvió una respuesta válida."
      );

    }


    return {

      text:
        String(text).trim(),

      model:
        data.model ||
        this.model,

      provider:
        this.name,

      usage:
        data.usage || null

    };

  }

}


/*
 * =========================================================
 * PROVIDER PREDETERMINADO
 * =========================================================
 */

export const modelProvider =
  new OpenAICompatibleProvider();
