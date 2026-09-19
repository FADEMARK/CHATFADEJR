/*
 * =========================================================
 * CHATFADE JR
 * OLLAMA PROVIDER
 * Version 0.7.4
 * Optimizado para Render Free
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

    /*
     * Timeout máximo por petición.
     * Render Free puede tardar bastante
     * cuando despierta o carga el modelo.
     */
    this.timeoutMs =
      Number(
        options.timeoutMs ||
        process.env.BRAIN_TIMEOUT_MS ||
        120000
      );
  }


  /*
   * =======================================================
   * VERIFICAR CONFIGURACIÓN
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
    temperature = 0.6
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
     * Preparado para proteger
     * CHATFADE-BRAIN más adelante.
     */
    if (this.apiKey) {

      headers.Authorization =
        `Bearer ${this.apiKey}`;
    }


    /*
     * =====================================================
     * PREPARAR MENSAJES
     * =====================================================
     */

    const requestMessages = [];


    /*
     * System Prompt
     */
    if (systemPrompt) {

      requestMessages.push({
        role: "system",
        content: String(systemPrompt)
      });
    }


    /*
     * Historial
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

      /*
       * ===================================================
       * REQUEST A OLLAMA
       * ===================================================
       */

      const response =
        await fetch(
          url,
          {
            method: "POST",

            headers,

            signal:
              controller.signal,

            body:
              JSON.stringify({

                model:
                  this.model,

                messages:
                  requestMessages,

                stream:
                  false,

                /*
                 * Mantener el modelo cargado
                 * algunos minutos.
                 *
                 * Esto ayuda muchísimo porque
                 * cargar Qwen desde cero es lento.
                 */
                keep_alive:
                  "5m",

                /*
                 * Opciones especialmente reducidas
                 * para Render Free (~512 MB RAM).
                 */
                options: {

                  temperature:
                    temperature,

                  /*
                   * Contexto reducido.
                   *
                   * Antes:
                   * 1024
                   *
                   * Ahora:
                   * 512
                   */
                  num_ctx:
                    512,

                  /*
                   * Respuestas más cortas.
                   *
                   * Reduce tiempo y memoria.
                   */
                  num_predict:
                    120,

                  /*
                   * Un solo thread inicialmente.
                   *
                   * Render Free tiene muy poca CPU.
                   */
                  num_thread:
                    1

                }

              })
          }
        );


      /*
       * ===================================================
       * ERROR HTTP
       * ===================================================
       */

      if (!response.ok) {

        const errorText =
          await response.text();


        throw new Error(
          `Ollama HTTP ${response.status}: ${errorText}`
        );
      }


      /*
       * ===================================================
       * RESPUESTA JSON
       * ===================================================
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

      /*
       * ===================================================
       * TIMEOUT
       * ===================================================
       */

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
   * COMPROBAR ESTADO
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
