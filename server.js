import express from "express";
import pg from "pg";

const { Pool } = pg;

const app = express();

app.use(express.json());

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
 * HOME
 * =========================================================
 */

app.get("/", (req, res) => {
  res.json({
    name: "CHATFADE JR",
    version: "0.4.0",
    status: "online",
    memory: "enabled",
    message: "Hola. Soy CHATFADE JR."
  });
});


/*
 * =========================================================
 * HEALTH CHECK
 * =========================================================
 */

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "chatfade-jr",
    version: "0.4.0",
    timestamp: new Date().toISOString()
  });
});


/*
 * =========================================================
 * DATABASE TEST
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
      message: "CHATFADE JR conectado a PostgreSQL",
      database: result.rows[0].database_name,
      database_time: result.rows[0].database_time
    });

  } catch (error) {

    console.error("Error PostgreSQL:", error);

    res.status(500).json({
      status: "error",
      message: "No fue posible conectar con PostgreSQL"
    });
  }

});


/*
 * =========================================================
 * OBTENER O CREAR USUARIO
 * =========================================================
 */

async function getOrCreateUser(externalId, name) {

  const existingUser = await pool.query(
    `
      SELECT
        id,
        external_id,
        name
      FROM chatfade_jr.users
      WHERE external_id = $1
    `,
    [externalId]
  );


  if (existingUser.rows.length > 0) {

    const user = existingUser.rows[0];


    /*
     * Actualizar nombre si cambió
     */
    if (name && user.name !== name) {

      const updatedUser = await pool.query(
        `
          UPDATE chatfade_jr.users
          SET
            name = $1,
            updated_at = NOW()
          WHERE id = $2
          RETURNING
            id,
            external_id,
            name
        `,
        [
          name,
          user.id
        ]
      );

      return updatedUser.rows[0];
    }


    return user;
  }


  /*
   * Crear usuario
   */
  const newUser = await pool.query(
    `
      INSERT INTO chatfade_jr.users (
        external_id,
        name
      )
      VALUES ($1, $2)
      RETURNING
        id,
        external_id,
        name
    `,
    [
      externalId,
      name || null
    ]
  );


  return newUser.rows[0];
}


/*
 * =========================================================
 * CREAR CONVERSACIÓN
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


/*
 * =========================================================
 * GUARDAR MENSAJE
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


  /*
   * Actualizar fecha de conversación
   */
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


/*
 * =========================================================
 * LEER HISTORIAL
 * =========================================================
 */

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
      LIMIT 20
    `,
    [conversationId]
  );


  return result.rows;
}


/*
 * =========================================================
 * OBTENER CONVERSACIÓN
 * =========================================================
 */

async function getConversation(
  conversationId,
  userId
) {

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


  if (result.rows.length === 0) {
    return null;
  }


  return result.rows[0];
}


/*
 * =========================================================
 * MOTOR LOCAL INICIAL
 * =========================================================
 *
 * Por ahora no usa OpenAI, Gemini ni Anthropic.
 *
 * Esta es nuestra primera capa propia:
 * reglas + usuario + historial.
 *
 * Más adelante reemplazaremos esta función por
 * un motor de lenguaje mucho más potente.
 */

function generateLocalResponse(
  history,
  userMessage,
  user
) {

  const lowerMessage =
    userMessage.toLowerCase();


  /*
   * ¿Cómo me llamo?
   */
  if (
    lowerMessage.includes("cómo me llamo") ||
    lowerMessage.includes("como me llamo")
  ) {

    if (user.name) {

      return `Te llamas ${user.name}.`;

    }

    return "Todavía no sé cómo te llamas.";
  }


  /*
   * ¿Quién soy?
   */
  if (
    lowerMessage.includes("quién soy") ||
    lowerMessage.includes("quien soy")
  ) {

    if (user.name) {

      return `Hasta ahora sé que eres ${user.name}.`;

    }

    return "Todavía no tengo suficiente información para decirte quién eres.";
  }


  /*
   * ¿Qué recuerdas?
   */
  if (
    lowerMessage.includes("qué recuerdas") ||
    lowerMessage.includes("que recuerdas")
  ) {

    const previousUserMessages = history
      .filter(item => item.role === "user")
      .map(item => item.content)
      .filter(content => {
        return (
          !content
            .toLowerCase()
            .includes("qué recuerdas") &&
          !content
            .toLowerCase()
            .includes("que recuerdas")
        );
      });


    if (previousUserMessages.length === 0) {

      return "Todavía no tengo recuerdos suficientes de esta conversación.";
    }


    return (
      "Recuerdo que me has dicho: " +
      previousUserMessages.join(" | ")
    );
  }


  /*
   * ¿Recuerdas...?
   */
  if (
    lowerMessage.startsWith("recuerdas") ||
    lowerMessage.startsWith("¿recuerdas")
  ) {

    const previousText = history
      .filter(item => item.role === "user")
      .map(item => item.content)
      .join(" ")
      .toLowerCase();


    const words = lowerMessage
      .replace(/[¿?.,]/g, "")
      .split(/\s+/)
      .filter(word => word.length >= 5);


    const match = words.some(word =>
      previousText.includes(word)
    );


    if (match) {

      return "Sí, encontré información relacionada en nuestra conversación.";

    }


    return "No encuentro ese recuerdo todavía en esta conversación.";
  }


  /*
   * Respuesta general temporal
   */
  const previousUserMessages = history
    .filter(item => item.role === "user");


  return (
    `Estoy siguiendo nuestra conversación` +
    `${user.name ? ", " + user.name : ""}. ` +
    `Este es tu mensaje número ` +
    `${previousUserMessages.length} en este hilo: ` +
    `"${userMessage}"`
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


    /*
     * Validaciones
     */

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
     * Obtener / crear usuario
     */

    const user = await getOrCreateUser(
      String(userId),
      name
    );


    /*
     * Obtener / crear conversación
     */

    let conversation;


    if (conversationId) {

      conversation = await getConversation(
        Number(conversationId),
        user.id
      );


      if (!conversation) {

        return res.status(404).json({
          status: "error",
          message: "Conversación no encontrada"
        });
      }

    } else {

      const title =
        userMessage.substring(0, 80);


      conversation =
        await createConversation(
          user.id,
          title
        );
    }


    /*
     * Guardar mensaje del usuario
     */

    await saveMessage(
      conversation.id,
      "user",
      userMessage
    );


    /*
     * Leer historial.
     *
     * Como ya guardamos el mensaje anterior,
     * history incluye también el mensaje actual.
     */

    const history =
      await getConversationContext(
        conversation.id
      );


    /*
     * Generar respuesta
     */

    const answer =
      generateLocalResponse(
        history,
        userMessage,
        user
      );


    /*
     * Guardar respuesta de CHATFADE JR
     */

    await saveMessage(
      conversation.id,
      "assistant",
      answer
    );


    /*
     * Respuesta API
     */

    res.json({
      status: "ok",

      assistant: {
        name: "CHATFADE JR",
        version: "0.4.0"
      },

      user: {
        id: user.id,
        externalId: user.external_id,
        name: user.name
      },

      conversation: {
        id: conversation.id,
        title: conversation.title
      },

      memory: {
        historyMessages: history.length
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
 * VER MENSAJES DE UNA CONVERSACIÓN
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


      if (!conversationId) {

        return res.status(400).json({
          status: "error",
          message: "conversationId inválido"
        });
      }


      const messages =
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
          messages.rows.length,
        messages:
          messages.rows
      });


    } catch (error) {

      console.error(
        "Error obteniendo mensajes:",
        error
      );


      res.status(500).json({
        status: "error",
        message:
          "No fue posible obtener la conversación"
      });
    }
  }
);


/*
 * =========================================================
 * INICIAR CHATFADE JR
 * =========================================================
 */

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `CHATFADE JR v0.4.0 iniciado en puerto ${PORT}`
    );

  }
);
