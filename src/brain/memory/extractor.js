/*
 * =========================================================
 * CHATFADE JR
 * MEMORY EXTRACTOR
 * Version 0.8.0
 * =========================================================
 *
 * Usa el mismo modelo de lenguaje para detectar
 * información personal que conviene guardar como memoria.
 *
 * Importante:
 * - NO guarda directamente en PostgreSQL.
 * - Solo propone recuerdos estructurados.
 * - server.js decide qué guardar.
 * =========================================================
 */

import { ollamaProvider } from "../providers/ollama.js";


export class MemoryExtractor {

  constructor() {
    this.name = "CHATFADE JR Memory Extractor";
    this.version = "0.8.0";
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


    /*
     * Memorias actuales para que el modelo pueda
     * detectar cuándo algo debe actualizarse.
     */

    const currentMemoryText =
      existingMemories.length > 0
        ? existingMemories
            .map(memory => {
              return (
                `${memory.memory_key} = ` +
                `${memory.memory_value}`
              );
            })
            .join("\n")
        : "Ninguna";


    /*
     * Prompt dedicado exclusivamente a extracción.
     */

    const systemPrompt = `
Eres el motor de memoria de CHATFADE JR.

Tu trabajo NO es conversar.

Tu trabajo es analizar el mensaje del usuario y detectar
hechos personales que puedan ser útiles en conversaciones futuras.

Debes responder EXCLUSIVAMENTE con JSON válido.

No uses markdown.
No uses bloques de código.
No expliques nada.

Formato exacto:

{
  "memories": [
    {
      "key": "nombre_de_la_memoria",
      "value": "valor",
      "importance": 1,
      "action": "upsert"
    }
  ]
}

Reglas:

1. Si no hay nada importante que recordar:
{
  "memories": []
}

2. Solo guarda hechos razonablemente estables o preferencias del usuario.

3. NO guardes preguntas casuales.

4. NO guardes saludos.

5. NO guardes información producida por CHATFADE JR.

6. NO inventes datos.

7. Usa keys cortas y consistentes en snake_case.

Ejemplos de keys:

name
nickname
favorite_color
favorite_food
favorite_team
workplace
job_role
city
country
pet_name
child_name
spouse_name
project
preference
explicit_memory

8. Si el usuario está cambiando una preferencia anterior,
usa la misma key con el nuevo valor.

9. importance:
1-3 = poco importante
4-6 = útil
7-8 = importante
9-10 = explícitamente pidió recordarlo

Memorias existentes:

${currentMemoryText}
`;


    /*
     * Solicitamos una salida corta.
     */

    const result =
      await ollamaProvider.generate({

        systemPrompt,

        messages: [
          {
            role: "user",
            content:
              `Mensaje del usuario:\n${String(message).trim()}`
          }
        ],

        temperature: 0.1

      });


    const raw =
      String(result.text)
        .trim();


    /*
     * =====================================================
     * LIMPIAR RESPUESTA
     * =====================================================
     *
     * Modelos pequeños pueden envolver el JSON
     * en ```json ... ```.
     */

    const cleaned =
      raw
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();


    /*
     * =====================================================
     * PARSEAR JSON
     * =====================================================
     */

    let parsed;


    try {

      parsed =
        JSON.parse(cleaned);

    } catch (error) {

      console.error(
        "Memory Extractor JSON inválido:",
        cleaned
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
     * VALIDAR RESULTADOS
     * =====================================================
     */

    const memories = [];


    for (
      const memory
      of parsed.memories
    ) {

      if (
        !memory ||
        typeof memory.key !== "string" ||
        typeof memory.value !== "string"
      ) {
        continue;
      }


      const key =
        memory.key
          .trim()
          .toLowerCase()
          .replace(
            /[^a-z0-9_]/g,
            "_"
          );


      const value =
        memory.value.trim();


      if (
        !key ||
        !value
      ) {
        continue;
      }


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
        Math.max(
          1,
          Math.min(
            10,
            importance
          )
        );


      memories.push({
        key,
        value,
        importance,
        action: "upsert"
      });
    }


    return memories;
  }

}


/*
 * =========================================================
 * INSTANCIA PRINCIPAL
 * =========================================================
 */

export const memoryExtractor =
  new MemoryExtractor();
