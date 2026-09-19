/*
 * =========================================================
 * CHATFADE JR
 * BRAIN CORE
 * Version 0.7.0
 * =========================================================
 *
 * Este archivo será la interfaz entre CHATFADE JR
 * y cualquier modelo de inteligencia que utilicemos.
 *
 * El resto de CHATFADE JR no necesita saber
 * qué modelo está funcionando detrás.
 */


export class ChatFadeBrain {

  constructor() {

    this.name = "CHATFADE JR Brain";

    this.version = "0.7.0";

    this.provider = "local";

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
     * Por ahora seguimos utilizando
     * nuestro motor local.
     *
     * Después conectaremos aquí
     * el modelo open-source.
     */

    const lower =
      message
        .toLowerCase()
        .trim();


    /*
     * NOMBRE
     */

    if (
      lower.includes("cómo me llamo") ||
      lower.includes("como me llamo")
    ) {

      return {
        text:
          user?.name
            ? `Te llamas ${user.name}.`
            : "Todavía no sé cómo te llamas.",

        provider:
          this.provider
      };

    }


    /*
     * MEMORIA
     */

    if (
      lower.includes("qué recuerdas de mí") ||
      lower.includes("que recuerdas de mi") ||
      lower.includes("qué sabes de mí") ||
      lower.includes("que sabes de mi")
    ) {

      if (!memories.length) {

        return {
          text:
            "Todavía no tengo recuerdos permanentes sobre ti.",

          provider:
            this.provider
        };

      }


      const memoryText =
        memories
          .map(memory =>
            memory.memory_value
          )
          .join(" | ");


      return {
        text:
          `Recuerdo esto sobre ti: ${memoryText}`,

        provider:
          this.provider
      };

    }


    /*
     * RESPUESTA TEMPORAL
     */

    return {

      text:
        `Estoy aprendiendo contigo, ${user?.name || "usuario"}. ` +
        `Entendí tu mensaje: "${message}"`,

      provider:
        this.provider

    };

  }

}


/*
 * =========================================================
 * INSTANCIA PRINCIPAL
 * =========================================================
 */

export const brain =
  new ChatFadeBrain();
