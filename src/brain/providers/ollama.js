/*
 * =========================================================
 * CHATFADE JR
 * OLLAMA PROVIDER
 * Version 0.7.2
 * =========================================================
 *
 * Conecta CHATFADE JR con nuestro servidor Ollama.
 * =========================================================
 */

export class OllamaProvider {

  constructor(options = {}) {

    this.name = "ollama";

    this.baseURL =
      options.baseURL ||
      process.env.BRAIN_BASE_URL;

    this.model =
      options.model ||
      process.env.BRAIN_MODEL ||
      "qwen2.5:0.5b";

    this.apiKey =
      options.apiKey ||
      process.env.BRAIN_API_KEY ||
      null;

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
    temperature = 0.7
  }) {

    if (!this.isConfigured()) {

      throw new Error(
        "Ollama Provider no está configurado."
      );

    }


    const url =
      `${this.baseURL.replace(/\/$/, "")}/api/chat`;


    const headers = {
      "Content-Type": "application/json"
    };


    /*
     * Preparado para cuando protejamos
     * CHATFADE-BRAIN con una API KEY.
     */

    if (this.apiKey) {

      headers.Authorization =
        `Bearer ${this.apiKey}`;

    }


    const requestMessages = [];


    /*
     * IDENTIDAD / SYSTEM PROMPT
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


      let role = "user";

      if (
        message.role === "assistant"
      ) {
        role = "assistant";
      }


      if (
        message.role === "system"
      ) {
        role = "system";
      }


      requestMessages.push({
        role,
        content:
          String(message.content)
      });

    }


    /*
     * LLAMADA A OLLAMA
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

              stream:
                false,

              options: {

                temperature:
                  temperature,

                /*
                 * Reducimos contexto para
                 * consumir menos RAM.
                 */

                num_ctx:
                  1024,

                /*
                 * Respuestas relativamente
                 * cortas mientras usamos
                 * Render Free.
                 */

                num_predict:
                  250

              }

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
        `Ollama HTTP ${response.status}: ${errorText}`
      );

    }


    /*
     * RESPUESTA
     */

    const data =
      await response.json();


    const text =
      data?.message?.content;


    if (!text) {

      throw new Error(
        "Ollama no devolvió contenido."
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

      done:
        data.done ?? true,

      totalDuration:
        data.total_duration ||
        null,

      evalCount:
        data.eval_count ||
        null

    };

  }

}


/*
 * =========================================================
 * INSTANCIA
 * =========================================================
 */

export const ollamaProvider =
  new OllamaProvider();
