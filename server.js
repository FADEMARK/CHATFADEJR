import express from "express";
import pg from "pg";

const { Pool } = pg;

const app = express();

app.use(express.json());
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;


/*
 * =========================================================
 * POSTGRESQL
 * =========================================================
 */

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});


/*
 * =========================================================
 * HEALTH
 * =========================================================
 */

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "chatfade-jr",
    version: "0.5.0",
    memory: "persistent",
    timestamp: new Date().toISOString()
  });
});


/*
 * =========================================================
 * DB TEST
 * =========================================================
 */

app.get("/db-test", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        NOW() AS database_time,
        current_database() AS database_name
    `);

    res.json({
      status: "ok",
      database: result.rows[0].database_name,
      database_time: result.rows[0].database_time
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      status: "error",
      message: "Error conectando a PostgreSQL"
    });
  }
});


/*
 * =========================================================
 * USUARIO
 * =========================================================
 */

async function getOrCreateUser(externalId, name) {

  const existing = await pool.query(
    `
      SELECT id, external_id, name
      FROM chatfade_jr.users
      WHERE external_id = $1
    `,
    [externalId]
  );


  if (existing.rows.length > 0) {

    const user = existing.rows[0];

    if (name && user.name !== name) {

      const updated = await pool.query(
        `
          UPDATE chatfade_jr.users
          SET
            name = $1,
            updated_at = NOW()
          WHERE id = $2
          RETURNING id, external_id, name
        `,
        [name, user.id]
      );

      return updated.rows[0];
    }

    return user;
  }


  const created = await pool.query(
    `
      INSERT INTO chatfade_jr.users (
        external_id,
        name
      )
      VALUES ($1, $2)
      RETURNING id, external_id, name
    `,
    [
      externalId,
      name || null
    ]
  );


  return created.rows[0];
}


/*
 * =========================================================
 * CONVERSACIONES
 * =========================================================
 */

async function createConversation(userId, title) {

  const result = await pool.query(
    `
      INSERT INTO chatfade_jr.conversations (
        user_id,
        title
      )
      VALUES ($1, $2)
      RETURNING
        id,
        user_id,
        title,
        created_at,
        updated_at
    `,
    [
      userId,
      title
    ]
  );

  return result.rows[0];
}


async function getConversation(conversationId, userId) {

  const result = await pool.query(
    `
      SELECT
        id,
        user_id,
        title,
        created_at,
        updated_at
      FROM chatfade_jr.conversations
      WHERE id = $1
        AND user_id = $2
    `,
    [
      conversationId,
      userId
    ]
  );

  return result.rows[0] || null;
}


/*
 * =========================================================
 * MENSAJES
 * =========================================================
 */

async function saveMessage(
  conversationId,
  role,
  content
) {

  const result = await pool.query(
    `
      INSERT INTO chatfade_jr.messages (
        conversation_id,
        role,
        content
      )
      VALUES ($1, $2, $3)
      RETURNING
        id,
        role,
        content,
        created_at
    `,
    [
      conversationId,
      role,
      content
    ]
  );


  await pool.query(
    `
      UPDATE chatfade_jr.conversations
      SET updated_at = NOW()
      WHERE id = $1
    `,
    [conversationId]
  );


  return result.rows[0];
}


async function getConversationContext(
  conversationId
) {

  const result = await pool.query(
    `
      SELECT
        role,
        content,
        created_at
      FROM chatfade_jr.messages
      WHERE conversation_id = $1
      ORDER BY created_at ASC, id ASC
      LIMIT 30
    `,
    [conversationId]
  );


  return result.rows;
}


/*
 * =========================================================
 * MEMORIA PERMANENTE
 * =========================================================
 */

async function saveMemory(
  userId,
  key,
  value,
  importance = 5,
  source = "conversation"
) {

  /*
   * Evitar duplicados exactos
   */
  const existing = await pool.query(
    `
      SELECT id
      FROM chatfade_jr.memories
      WHERE user_id = $1
        AND LOWER(memory_value) = LOWER($2)
      LIMIT 1
    `,
    [
      userId,
      value
    ]
  );


  if (existing.rows.length > 0) {
    return existing.rows[0];
  }


  const result = await pool.query(
    `
      INSERT INTO chatfade_jr.memories (
        user_id,
        memory_key,
        memory_value,
        importance,
        source
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING
        id,
        memory_key,
        memory_value,
        importance,
        source,
        created_at
    `,
    [
      userId,
      key,
      value,
      importance,
      source
    ]
  );


  return result.rows[0];
}


async function getMemories(userId) {

  const result = await pool.query(
    `
      SELECT
        id,
        memory_key,
        memory_value,
        importance,
        source,
        created_at
      FROM chatfade_jr.memories
      WHERE user_id = $1
      ORDER BY
        importance DESC,
        created_at DESC
      LIMIT 50
    `,
    [userId]
  );


  return result.rows;
}


/*
 * =========================================================
 * DETECTAR RECUERDOS
 * =========================================================
 */

async function detectAndSaveMemory(
  user,
  message
) {

  const text = message.trim();
  const lower = text.toLowerCase();


  /*
   * "Recuerda que..."
   */
  if (
    lower.startsWith("recuerda que ") ||
    lower.startsWith("quiero que recuerdes que ")
  ) {

    const value = text
      .replace(/^recuerda que\s+/i, "")
      .replace(/^quiero que recuerdes que\s+/i, "")
      .trim();


    if (value) {

      await saveMemory(
        user.id,
        "explicit_memory",
        value,
        9,
        "user"
      );

      return {
        saved: true,
        value: value
      };
    }
  }


  /*
   * Color favorito
   */
  const colorMatch =
    text.match(
      /mi color favorito es (.+)/i
    );


  if (colorMatch) {

    const color =
      colorMatch[1]
        .replace(/[.!?]+$/, "")
        .trim();


    await saveMemory(
      user.id,
      "favorite_color",
      color,
      8,
      "user"
    );


    return {
      saved: true,
      value: `Tu color favorito es ${color}`
    };
  }


  /*
   * Comida favorita
   */
  const foodMatch =
    text.match(
      /mi comida favorita es (.+)/i
    );


  if (foodMatch) {

    const food =
      foodMatch[1]
        .replace(/[.!?]+$/, "")
        .trim();


    await saveMemory(
      user.id,
      "favorite_food",
      food,
      8,
      "user"
    );


    return {
      saved: true,
      value: `Tu comida favorita es ${food}`
    };
  }


  /*
   * Trabajo
   */
  const workMatch =
    text.match(
      /trabajo (?:en|para) (.+)/i
    );


  if (workMatch) {

    const workplace =
      workMatch[1]
        .replace(/[.!?]+$/, "")
        .trim();


    await saveMemory(
      user.id,
      "workplace",
      workplace,
      7,
      "user"
    );


    return {
      saved: true,
      value: `Trabajas en ${workplace}`
    };
  }


  return {
    saved: false
  };
}


/*
 * =========================================================
 * MOTOR LOCAL
 * =========================================================
 */

async function generateLocalResponse(
  history,
  userMessage,
  user
) {

  const lower =
    userMessage.toLowerCase();

  const memories =
    await getMemories(user.id);


  /*
   * Nombre
   */
  if (
    lower.includes("cómo me llamo") ||
    lower.includes("como me llamo")
  ) {

    if (user.name) {
      return `Te llamas ${user.name}.`;
    }

    return "Todavía no sé cómo te llamas.";
  }


  /*
   * Memoria permanente
   */
  if (
    lower.includes("qué recuerdas de mí") ||
    lower.includes("que recuerdas de mi") ||
    lower.includes("qué sabes de mí") ||
    lower.includes("que sabes de mi")
  ) {

    if (memories.length === 0) {

      return (
        "Todavía no tengo recuerdos permanentes sobre ti."
      );
    }


    const memoryText =
      memories
        .map(memory => memory.memory_value)
        .join(" | ");


    return (
      `Tengo estos recuerdos sobre ti: ${memoryText}`
    );
  }


  /*
   * Color favorito
   */
  if (
    lower.includes("cuál es mi color favorito") ||
    lower.includes("cual es mi color favorito")
  ) {

    const memory =
      memories.find(
        item =>
          item.memory_key ===
          "favorite_color"
      );


    if (memory) {
      return `Tu color favorito es ${memory.memory_value}.`;
    }


    return (
      "Todavía no me has dicho cuál es tu color favorito."
    );
  }


  /*
   * ¿Dónde trabajo?
   */
  if (
    lower.includes("dónde trabajo") ||
    lower.includes("donde trabajo")
  ) {

    const memory =
      memories.find(
        item =>
          item.memory_key ===
          "workplace"
      );


    if (memory) {

      return `Me dijiste que trabajas en ${memory.memory_value}.`;
    }


    return (
      "Todavía no tengo guardado dónde trabajas."
    );
  }


  /*
   * Historial de conversación
   */
  if (
    lower.includes("qué recuerdas de nuestra conversación") ||
    lower.includes("que recuerdas de nuestra conversacion")
  ) {

    const userMessages =
      history
        .filter(
          item =>
            item.role === "user"
        )
        .map(
          item => item.content
        )
        .filter(
          content =>
            !content
              .toLowerCase()
              .includes("qué recuerdas")
        );


    if (userMessages.length === 0) {

      return (
        "Todavía no tengo recuerdos suficientes de esta conversación."
      );
    }


    return (
      "En esta conversación recuerdo que me dijiste: " +
      userMessages.join(" | ")
    );
  }


  /*
   * Respuesta general temporal
   */
  return (
    `Estoy aprendiendo contigo` +
    `${user.name ? ", " + user.name : ""}. ` +
    `Recibí tu mensaje: "${userMessage}"`
  );
}


/*
 * =========================================================
 * CHAT
 * =========================================================
 */

app.post("/chat", async (req, res) => {

  try {

    const {
      userId,
      name,
      message,
      conversationId
    } = req.body;


    if (!userId) {

      return res.status(400).json({
        status: "error",
        message: "userId es obligatorio"
      });
    }


    if (
      !message ||
      !String(message).trim()
    ) {

      return res.status(400).json({
        status: "error",
        message: "message es obligatorio"
      });
    }


    const userMessage =
      String(message).trim();


    /*
     * Usuario
     */
    const user =
      await getOrCreateUser(
        String(userId),
        name
      );


    /*
     * Conversación
     */
    let conversation;


    if (conversationId) {

      conversation =
        await getConversation(
          Number(conversationId),
          user.id
        );


      if (!conversation) {

        return res.status(404).json({
          status: "error",
          message:
            "Conversación no encontrada"
        });
      }

    } else {

      conversation =
        await createConversation(
          user.id,
          userMessage.substring(0, 80)
        );
    }


    /*
     * Guardar mensaje
     */
    await saveMessage(
      conversation.id,
      "user",
      userMessage
    );


    /*
     * Detectar recuerdos
     */
    const memoryResult =
      await detectAndSaveMemory(
        user,
        userMessage
      );


    /*
     * Historial
     */
    const history =
      await getConversationContext(
        conversation.id
      );


    /*
     * Generar respuesta
     */
    let answer;


    if (memoryResult.saved) {

      answer =
        `Lo recordaré, ${user.name || "usuario"}: ` +
        `${memoryResult.value}.`;

    } else {

      answer =
        await generateLocalResponse(
          history,
          userMessage,
          user
        );
    }


    /*
     * Guardar respuesta
     */
    await saveMessage(
      conversation.id,
      "assistant",
      answer
    );


    /*
     * Respuesta
     */
    res.json({
      status: "ok",

      assistant: {
        name: "CHATFADE JR",
        version: "0.5.0"
      },

      conversation: {
        id: conversation.id,
        title: conversation.title
      },

      memory: {
        persistent: true,
        savedThisTurn:
          memoryResult.saved
      },

      response: answer
    });


  } catch (error) {

    console.error(
      "Error /chat:",
      error
    );


    res.status(500).json({
      status: "error",
      message:
        "CHATFADE JR tuvo un problema procesando el mensaje"
    });
  }

});


/*
 * =========================================================
 * MENSAJES DE CONVERSACIÓN
 * =========================================================
 */

app.get(
  "/conversations/:conversationId/messages",
  async (req, res) => {

    try {

      const conversationId =
        Number(
          req.params.conversationId
        );


      const result =
        await pool.query(
          `
            SELECT
              id,
              role,
              content,
              created_at
            FROM chatfade_jr.messages
            WHERE conversation_id = $1
            ORDER BY created_at ASC, id ASC
          `,
          [conversationId]
        );


      res.json({
        status: "ok",
        conversationId:
          conversationId,
        total:
          result.rows.length,
        messages:
          result.rows
      });


    } catch (error) {

      res.status(500).json({
        status: "error",
        message:
          "No fue posible obtener mensajes"
      });
    }
  }
);


/*
 * =========================================================
 * VER MEMORIA
 * =========================================================
 */

app.get(
  "/users/:externalId/memories",
  async (req, res) => {

    try {

      const externalId =
        req.params.externalId;


      const userResult =
        await pool.query(
          `
            SELECT id, name
            FROM chatfade_jr.users
            WHERE external_id = $1
          `,
          [externalId]
        );


      if (
        userResult.rows.length === 0
      ) {

        return res.status(404).json({
          status: "error",
          message: "Usuario no encontrado"
        });
      }


      const user =
        userResult.rows[0];


      const memories =
        await getMemories(
          user.id
        );


      res.json({
        status: "ok",

        user: {
          id: user.id,
          name: user.name
        },

        total:
          memories.length,

        memories:
          memories
      });


    } catch (error) {

      console.error(error);


      res.status(500).json({
        status: "error",
        message:
          "No fue posible leer la memoria"
      });
    }
  }
);


/*
 * =========================================================
 * START
 * =========================================================
 */

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `CHATFADE JR v0.5.0 iniciado en puerto ${PORT}`
    );

  }
);
