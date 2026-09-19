/*
 * =========================================================
 * CHATFADE JR
 * MEMORY EXTRACTOR
 * Version 0.8.2
 *
 * Estrategia híbrida:
 * 1. Detecta memorias comunes mediante reglas seguras.
 * 2. Evita usar Qwen cuando no es necesario.
 * 3. Usa Qwen únicamente para información más compleja.
 * 4. Valida las propuestas del modelo antes de aceptarlas.
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
      "0.8.2";


    /*
     * Keys que permitiremos guardar
     * cuando sean propuestas por Qwen.
     */

    this.allowedKeys =
      new Set([
        "name",
        "nickname",
        "favorite_color",
        "favorite_food",
        "favorite_team",
        "favorite_music",
        "favorite_movie",
        "favorite_game",
        "pet_name",
        "pet_type",
        "spouse_name",
        "child_name",
        "workplace",
        "job_role",
        "city",
        "country",
        "project",
        "preference",
        "explicit_memory"
      ]);
  }


  /*
   * =======================================================
   * UTILIDADES
   * =======================================================
   */

  cleanValue(value) {

    if (!value) {
      return "";
    }


    return String(value)
      .trim()
      .replace(
        /^[,;:\s]+/,
        ""
      )
      .replace(
        /[,;.!?]+$/,
        ""
      )
      .replace(
        /\s+/g,
        " "
      );
  }


  createMemory(
    key,
    value,
    importance = 7,
    source = "rule"
  ) {

    const clean =
      this.cleanValue(
        value
      );


    if (!clean) {
      return null;
    }


    if (
      clean.length > 250
    ) {
      return null;
    }


    return {
      key,
      value: clean,
      importance,
      action: "upsert",
      source
    };
  }


  /*
   * =======================================================
   * EXTRAER CON REGLAS
   * =======================================================
   */

  extractWithRules(message) {

    const text =
      String(message)
        .trim();


    const memories = [];


    /*
     * -----------------------------------------------------
     * NOMBRE
     * -----------------------------------------------------
     *
     * Me llamo Johan
     * Mi nombre es Johan
     */

    const nameMatch =
      text.match(
        /\b(?:me llamo|mi nombre es)\s+([a-záéíóúüñ][a-záéíóúüñ\s'-]{1,60}?)(?=\s*(?:[,.;!?]|$))/i
      );


    if (nameMatch) {

      const memory =
        this.createMemory(
          "name",
          nameMatch[1],
          9
        );


      if (memory) {
        memories.push(memory);
      }
    }


    /*
     * -----------------------------------------------------
     * COLOR FAVORITO
     * -----------------------------------------------------
     *
     * Mi color favorito es azul
     * Me gusta el color azul
     */

    const favoriteColor =
      text.match(
        /\bmi color favorito es\s+([a-záéíóúüñ\s-]+?)(?=\s*(?:[,.;!?]|\by\b|$))/i
      );


    const likesColor =
      text.match(
        /\bme gusta el color\s+([a-záéíóúüñ\s-]+?)(?=\s*(?:[,.;!?]|\by\b|$))/i
      );


    const colorMatch =
      favoriteColor ||
      likesColor;


    if (colorMatch) {

      const memory =
        this.createMemory(
          "favorite_color",
          colorMatch[1],
          8
        );


      if (memory) {
        memories.push(memory);
      }
    }


    /*
     * -----------------------------------------------------
     * EQUIPO
     * -----------------------------------------------------
     *
     * Le voy al Cruz Azul
     * Le voy a Cruz Azul
     * Mi equipo favorito es Cruz Azul
     */

    const teamMatch =
      text.match(
        /\b(?:le voy al|le voy a|mi equipo favorito es)\s+(.+?)(?=\s*(?:[,.;!?]|\by\s+(?:mi|me|soy|trabajo|vivo|tengo)\b|$))/i
      );


    if (teamMatch) {

      const memory =
        this.createMemory(
          "favorite_team",
          teamMatch[1],
          8
        );


      if (memory) {
        memories.push(memory);
      }
    }


    /*
     * -----------------------------------------------------
     * MASCOTA
     * -----------------------------------------------------
     *
     * Mi perro se llama Max
     * Mi gato se llama Luna
     * Mi mascota se llama Toby
     */

    const petMatch =
      text.match(
        /\bmi\s+(perro|perra|gato|gata|mascota)\s+se llama\s+(.+?)(?=\s*(?:[,.;!?]|\by\b|$))/i
      );


    if (petMatch) {

      const petType =
        this.createMemory(
          "pet_type",
          petMatch[1],
          6
        );


      const petName =
        this.createMemory(
          "pet_name",
          petMatch[2],
          8
        );


      if (petType) {
        memories.push(petType);
      }


      if (petName) {
        memories.push(petName);
      }
    }


    /*
     * -----------------------------------------------------
     * TRABAJO
     * -----------------------------------------------------
     *
     * Trabajo en ROCKA
     * Trabajo para ROCKA
     */

    const workplaceMatch =
      text.match(
        /\btrabajo\s+(?:en|para)\s+(.+?)(?=\s*(?:[,.;!?]|\by\s+(?:soy|mi|me|vivo|tengo)\b|$))/i
      );


    if (workplaceMatch) {

      const memory =
        this.createMemory(
          "workplace",
          workplaceMatch[1],
          8
        );


      if (memory) {
        memories.push(memory);
      }
    }


    /*
     * -----------------------------------------------------
     * CIUDAD
     * -----------------------------------------------------
     *
     * Vivo en Querétaro
     */

    const cityMatch =
      text.match(
        /\bvivo en\s+(.+?)(?=\s*(?:[,.;!?]|\by\s+(?:soy|mi|me|trabajo|tengo)\b|$))/i
      );


    if (cityMatch) {

      const memory =
        this.createMemory(
          "city",
          cityMatch[1],
          7
        );


      if (memory) {
        memories.push(memory);
      }
    }


    /*
     * -----------------------------------------------------
     * RECUERDO EXPLÍCITO
     * -----------------------------------------------------
     */

    const explicitMatch =
      text.match(
        /^(?:recuerda que|quiero que recuerdes que)\s+(.+)$/i
      );


    if (explicitMatch) {

      const memory =
        this.createMemory(
          "explicit_memory",
          explicitMatch[1],
          10
        );


      if (memory) {
        memories.push(memory);
      }
    }


    return this.removeDuplicates(
      memories
    );
  }


  /*
   * =======================================================
   * QUITAR DUPLICADOS
   * =======================================================
   */

  removeDuplicates(memories) {

    const result = [];

    const seen =
      new Set();


    for (const memory of memories) {

      if (!memory) {
        continue;
      }


      const signature =
        `${memory.key}:${String(
          memory.value
        ).toLowerCase()}`;


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


      result.push(
        memory
      );
    }


    return result;
  }


  /*
   * =======================================================
   * ¿DEBEMOS CONSULTAR A QWEN?
   * =======================================================
   */

  shouldUseAI(
    message,
    ruleMemories
  ) {

    const text =
      String(message)
        .trim();


    /*
     * Si nuestras reglas ya encontraron
     * información, evitamos una segunda
     * inferencia.
     *
     * Esto hace CHATFADE JR mucho más rápido.
     */

    if (
      ruleMemories.length > 0
    ) {
      return false;
    }


    /*
     * Mensajes muy cortos no necesitan
     * análisis semántico.
     */

    if (
      text.length < 15
    ) {
      return false;
    }


    const lower =
      text.toLowerCase();


    /*
     * Preguntas normalmente no son recuerdos.
     */

    if (
      lower.startsWith("qué ") ||
      lower.startsWith("que ") ||
      lower.startsWith("cómo ") ||
      lower.startsWith("como ") ||
      lower.startsWith("cuándo ") ||
      lower.startsWith("cuando ") ||
      lower.startsWith("dónde ") ||
      lower.startsWith("donde ") ||
      lower.startsWith("por qué ") ||
      lower.startsWith("porque ") ||
      lower.startsWith("quién ") ||
      lower.startsWith("quien ") ||
      text.endsWith("?")
    ) {

      return false;
    }


    /*
     * Señales de que el usuario está hablando
     * sobre sí mismo.
     */

    const personalSignals = [
      "mi ",
      "me ",
      "soy ",
      "tengo ",
      "trabajo ",
      "vivo ",
      "estoy ",
      "prefiero ",
      "quiero ",
      "estoy haciendo ",
      "estoy construyendo "
    ];


    return personalSignals.some(
      signal =>
        lower.includes(signal)
    );
  }


  /*
   * =======================================================
   * EXTRAER CON IA
   * =======================================================
   */

  async extractWithAI({
    message,
    existingMemories
  }) {

    const existingText =
      existingMemories.length > 0
        ? existingMemories
            .map(
              memory =>
                `${memory.memory_key}=${memory.memory_value}`
            )
            .join("\n")
        : "Ninguna";


    /*
     * Prompt deliberadamente corto.
     *
     * Qwen 0.5B se confunde más cuanto
     * más instrucciones le damos.
     */

    const systemPrompt = `
Extrae hechos personales explícitos del usuario.

Devuelve SOLO JSON.

Formato:
{"memories":[]}

O:
{"memories":[{"key":"project","value":"texto","importance":7}]}

Keys permitidas:
name,nickname,favorite_color,favorite_food,favorite_team,favorite_music,favorite_movie,favorite_game,pet_name,pet_type,spouse_name,child_name,workplace,job_role,city,country,project,preference,explicit_memory

REGLAS:
- Solo información escrita explícitamente por el usuario.
- Nunca inventes.
- No copies estas instrucciones como memoria.
- Si no hay un hecho personal claro devuelve {"memories":[]}.
- No guardes preguntas.
- No guardes saludos.

Memorias existentes:
${existingText}
`;


    try {

      const result =
        await ollamaProvider.generate({

          systemPrompt,

          messages: [
            {
              role: "user",
              content:
                String(message).trim()
            }
          ],

          temperature: 0,

          format: "json",

          /*
           * Más espacio para cerrar JSON.
           */
          maxTokens: 220,

          contextSize: 512
        });


      let raw =
        String(
          result.text
        ).trim();


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


      let parsed;


      try {

        parsed =
          JSON.parse(raw);

      } catch (error) {

        console.error(
          "Memory AI JSON inválido:",
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


      return this.validateAIMemories(
        parsed.memories,
        message
      );


    } catch (error) {

      console.error(
        "Memory AI error:",
        error.message
      );


      return [];
    }
  }


  /*
   * =======================================================
   * VALIDACIÓN ANTI-ALUCINACIÓN
   * =======================================================
   */

  validateAIMemories(
    proposedMemories,
    originalMessage
  ) {

    const result = [];


    const source =
      String(
        originalMessage
      )
        .toLowerCase();


    for (
      const memory
      of proposedMemories
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
          .toLowerCase();


      if (
        !this.allowedKeys.has(
          key
        )
      ) {

        continue;
      }


      const value =
        this.cleanValue(
          memory.value
        );


      if (
        !value ||
        value.length > 250
      ) {

        continue;
      }


      /*
       * Protección fundamental:
       *
       * El valor propuesto debe aparecer
       * en el mensaje original.
       *
       * Así Qwen no puede inventarse
       * "Sandía", "restaurante", etc.
       */

      if (
        !source.includes(
          value.toLowerCase()
        )
      ) {

        console.warn(
          `Memoria rechazada por posible alucinación: ${key}=${value}`
        );

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

        importance = 6;
      }


      importance =
        Math.max(
          4,
          Math.min(
            9,
            Math.round(
              importance
            )
          )
        );


      result.push({

        key,

        value,

        importance,

        action:
          "upsert",

        source:
          "ai"

      });
    }


    return this.removeDuplicates(
      result
    );
  }


  /*
   * =======================================================
   * EXTRACT PRINCIPAL
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
     * PASO 1
     *
     * Extracción segura mediante reglas.
     */

    const ruleMemories =
      this.extractWithRules(
        message
      );


    if (
      ruleMemories.length > 0
    ) {

      console.log(
        "Memory Engine RULE:",
        ruleMemories
      );


      return ruleMemories;
    }


    /*
     * PASO 2
     *
     * Decidir si realmente vale la pena
     * gastar una inferencia.
     */

    if (
      !this.shouldUseAI(
        message,
        ruleMemories
      )
    ) {

      return [];
    }


    /*
     * PASO 3
     *
     * IA para frases más complejas.
     */

    const aiMemories =
      await this.extractWithAI({

        message,

        existingMemories

      });


    if (
      aiMemories.length > 0
    ) {

      console.log(
        "Memory Engine AI:",
        aiMemories
      );
    }


    return aiMemories;
  }

}


/*
 * =========================================================
 * INSTANCIA PRINCIPAL
 * =========================================================
 */

export const memoryExtractor =
  new MemoryExtractor();
