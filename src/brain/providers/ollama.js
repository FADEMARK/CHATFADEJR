/*
 * =========================================================
 * CHATFADE JR
 * OLLAMA PROVIDER
 * Version 0.8.1
 * Optimizado para Render Free
 * Soporte de salida JSON estructurada
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

    this.timeoutMs =
      Number(
        options.timeoutMs ||
        process.env.BRAIN_TIMEOUT_MS ||
        120000
      );
  }


  /*
   * =======================================================
   * CONFIGURACION
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
   * GENERAR
   * =======================================================
   */

  async generate({
    systemPrompt,
    messages = [],
    temperature = 0.6,
    format = null,
    maxTokens = 120,
    contextSize = 512
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
     * Para cuando protejamos
     * CHATFADE-BRAIN con token.
     */
    if (this.apiKey) {

      headers.Authorization =
        `Bearer ${this.apiKey}`;
    }


    /*
     * =====================================================
     * MENSAJES
     * =====================================================
     */

    const requestMessages = [];


    if (systemPrompt) {

      requestMessages.push({
        role: "system",
        content: String(systemPrompt)
      });
    }


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
     * =====================================================
     * BODY
     * =====================================================
     */

    const body = {

      model:
        this.model,

      messages:
        requestMessages,

      stream:
        false,

      /*
       * Mantener el modelo cargado.
       */
      keep_alive:
        "5m",

      options: {

        temperature:
          temperature,

        num_ctx:
          contextSize,

        num_predict:
          maxTokens,

        num_thread:
          1
      }
    };


    /*
     * Ollama puede forzar JSON.
     */
    if (format) {

      body.format =
        format;
    }


    /*
     * =====================================================
     * TIMEOUT
     * =====================================================
     */

    const controller =
      new AbortController();


    const timeout =
      setTimeout(
        () => {
          controller.abort();
        },
        this.timeoutMs
      );


    try {

      const response =
        await fetch(
          url,
          {
            method: "POST",

            headers,

            signal:
              controller.signal,

            body:
              JSON.stringify(
                body
              )
          }
        );


      if (!response.ok) {

        const errorText =
          await response.text();


        throw new Error(
          `Ollama HTTP ${response.status}: ${errorText}`
        );
      }


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

        doneReason:
          data.done_reason ||
          null,

        totalDuration:
          data.total_duration ||
          null,

        loadDuration:
          data.load_duration ||
          null,

        promptEvalCount:
          data.prompt_eval_count ||
          null,

        promptEvalDuration:
          data.prompt_eval_duration ||
          null,

        evalCount:
          data.eval_count ||
          null,

        evalDuration:
          data.eval_duration ||
          null
      };


    } catch (error) {

      if (
        error.name ===
        "AbortError"
      ) {

        throw new Error(
          `CHATFADE-BRAIN tardó más de ${Math.round(
            this.timeoutMs / 1000
          )} segundos en responder.`
        );
      }


      throw error;


    } finally {

      clearTimeout(
        timeout
      );
    }
  }


  /*
   * =======================================================
   * HEALTH
   * =======================================================
   */

  async health() {

    if (!this.baseURL) {

      return {
        status: "error",
        message:
          "BRAIN_BASE_URL no configurado"
      };
    }


    try {

      const response =
        await fetch(
          `${this.baseURL.replace(/\/$/, "")}/api/tags`
        );


      if (!response.ok) {

        return {
          status: "error",
          httpStatus:
            response.status
        };
      }


      const data =
        await response.json();


      const models =
        Array.isArray(
          data.models
        )
          ? data.models.map(
              model => model.name
            )
          : [];


      return {

        status: "ok",

        model:
          this.model,

        modelAvailable:
          models.includes(
            this.model
          ),

        models:
          models
      };


    } catch (error) {

      return {

        status: "error",

        message:
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

export const ollamaProvider =
  new OllamaProvider();
