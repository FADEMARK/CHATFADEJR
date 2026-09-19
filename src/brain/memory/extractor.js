/*
 * =========================================================
 * CHATFADE JR
 * MEMORY EXTRACTOR
 * Version 0.8.1
 * =========================================================
 */

import {
  ollamaProvider
} from "../providers/ollama.js";


export class MemoryExtractor {

  constructor() {

    this.name =
      "CHATFADE JR Memory Extractor";

    this.version =
      "0.8.1";
  }


  /*
   * =======================================================
   * EXTRAER MEMORIAS
   * =======================================================
   */

  async extract({
    message,
    existingMemories = []
  }) {

    if (
      !message ||
      !String(message).trim()
    ) {

      return [];
    }


    const userMessage =
      String(message)
        .trim();


    /*
     * =====================================================
     * MEMORIAS EXISTENTES
     * =====================================================
     */

    const existingText =
      existingMemories.length > 0
        ? existingMemories
            .map(
              memory =>
                `${memory.memory_key} = ${memory.memory_value}`
            )
            .join("\n")
        : "Ninguna";


    /*
     * =====================================================
     * SYSTEM PROMPT
     * =====================================================
     */

    const systemPrompt = `
Eres exclusivamente el extractor de memoria de CHATFADE JR.

NO converses con el usuario.
NO respondas preguntas.
NO des explicaciones.
NO escribas markdown.

Tu única función es detectar información personal útil y relativamente estable sobre el usuario.

Debes devolver EXCLUSIVAMENTE JSON válido.

Formato obligatorio:

{
  "memories": [
    {
      "key": "clave",
      "value": "valor",
      "importance": 5,
      "action": "upsert"
    }
  ]
}

Si no existe nada útil que recordar:

{
  "memories": []
}

REGLAS:

- No inventes información.
- No guardes saludos.
- No guardes preguntas.
- No guardes respuestas del asistente.
- No guardes información temporal irrelevante.
- No guardes frases completas si puedes extraer el dato.
- Si una memoria ya existe y el usuario proporciona un nuevo valor, usa la misma key.
- Utiliza snake_case.
- importance debe estar entre 1 y 10.

CLAVES PREFERIDAS:

name
nickname
favorite_color
favorite_food
favorite_team
favorite_music
favorite_movie
favorite_game
pet_name
pet_type
spouse_name
child_name
workplace
job_role
city
country
project
preference
explicit_memory

EJEMPLO 1:

Usuario:
Me gusta el color azul.

Respuesta:

{
  "memories": [
    {
      "key": "favorite_color",
      "value": "azul",
      "importance": 7,
      "action": "upsert"
    }
  ]
}

EJEMPLO 2:

Usuario:
Le voy al Cruz Azul y mi perro se llama Max.

Respuesta:

{
  "memories": [
    {
      "key": "favorite_team",
      "value": "Cruz Azul",
      "importance": 7,
      "action": "upsert"
    },
    {
      "key": "pet_name",
      "value": "Max",
      "importance": 7,
      "action": "upsert"
    }
  ]
}

EJEMPLO 3:

Usuario:
¿Cuánto es 2 + 2?

Respuesta:

{
  "memories": []
}

MEMORIAS ACTUALES:

${existingText}
`;


    /*
     * =====================================================
     * LLAMADA AL MODELO
     * =====================================================
     */

    const result =
      await ollamaProvider.generate({

        systemPrompt,

        messages: [
          {
            role: "user",

            content:
              `Extrae únicamente recuerdos del siguiente mensaje:\n\n${userMessage}`
          }
        ],

        /*
         * Casi determinístico.
         */
        temperature:
          0,

        /*
         * Forzar JSON.
         */
        format:
          "json",

        /*
         * Extracción debe ser corta.
         */
        maxTokens:
          160,

        /*
         * Contexto pequeño para Render Free.
         */
        contextSize:
          512
      });


    /*
     * =====================================================
     * LIMPIAR
     * =====================================================
     */

    let raw =
      String(
        result.text
      )
        .trim();


    /*
     * Protección adicional por si el modelo
     * aún mete markdown.
     */
    raw =
      raw
        .replace(
          /^```json\s*/i,
          ""
        )
        .replace(
          /^```\s*/i,
          ""
        )
        .replace(
          /\s*```$/i,
          ""
        )
        .trim();


    /*
     * =====================================================
     * PARSE JSON
     * =====================================================
     */

    let parsed;


    try {

      parsed =
        JSON.parse(
          raw
        );

    } catch (error) {

      console.error(
        "CHATFADE MEMORY JSON INVALID:"
      );

      console.error(
        raw
      );


      return [];
    }


    if (
      !parsed ||
      !Array.isArray(
        parsed.memories
      )
    ) {

      return [];
    }


    /*
     * =====================================================
     * VALIDAR MEMORIAS
     * =====================================================
     */

    const memories = [];


    for (
      const memory
      of parsed.memories
    ) {

      if (
        !memory ||
        typeof memory.key !==
          "string" ||
        typeof memory.value !==
          "string"
      ) {

        continue;
      }


      /*
       * KEY
       */

      const key =
        memory.key
          .trim()
          .toLowerCase()
          .replace(
            /[^a-z0-9_]/g,
            "_"
          )
          .replace(
            /_+/g,
            "_"
          )
          .replace(
            /^_|_$/g,
            ""
          );


      /*
       * VALUE
       */

      const value =
        memory.value
          .trim()
          .replace(
            /\s+/g,
            " "
          );


      if (
        !key ||
        !value
      ) {

        continue;
      }


      /*
       * Evitar valores gigantes.
       */

      if (
        value.length > 500
      ) {

        continue;
      }


      /*
       * IMPORTANCE
       */

      let importance =
        Number(
          memory.importance
        );


      if (
        !Number.isFinite(
          importance
        )
      ) {

        importance = 5;
      }


      importance =
        Math.round(
          Math.max(
            1,
            Math.min(
              10,
              importance
            )
          )
        );


      /*
       * RESULTADO
       */

      memories.push({

        key,

        value,

        importance,

        action:
          "upsert"

      });
    }


    /*
     * Evitar duplicados dentro
     * de una misma extracción.
     */

    const unique =
      [];


    const seen =
      new Set();


    for (
      const memory
      of memories
    ) {

      const signature =
        `${memory.key}:${memory.value.toLowerCase()}`;


      if (
        seen.has(
          signature
        )
      ) {

        continue;
      }


      seen.add(
        signature
      );


      unique.push(
        memory
      );
    }


    return unique;
  }

}


/*
 * =========================================================
 * INSTANCIA
 * =========================================================
 */

export const memoryExtractor =
  new MemoryExtractor();
