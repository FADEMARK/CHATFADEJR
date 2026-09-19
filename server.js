import express from "express";
import pg from "pg";

const { Pool } = pg;

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 3000;

/*
 * PostgreSQL
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
    version: "0.3.0",
    status: "online",
    message: "Hola. Soy CHATFADE JR.",
    memory: "enabled"
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
    version: "0.3.0",
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
 * OBTENER / CREAR USUARIO
 * =========================================================
 */
async function getOrCreateUser(externalId, name) {

  const existingUser = await pool.query(
    `
      SELECT id, external_id, name
      FROM chatfade_jr.users
      WHERE external_id = $1
    `,
    [externalId]
  );


  if (existingUser.rows.length > 0) {

    const user = existingUser.rows[0];

    /*
     * Actualizar nombre si cambió.
     */
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


  const newUser = await pool.query(
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
      RETURNING id, title, created_at
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
async function saveMessage(conversationId, role, content) {
async function getConversationContext(conversationId) {
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
  const result = await pool.query(
    `
      INSERT INTO chatfade_jr.messages (
        conversation_id,
        role,
        content
      )
      VALUES ($1, $2, $3)
      RETURNING id, role, content, created_at
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


/*
 * =========================================================
 * CHAT
 * =========================================================
 *
 * Por ahora CHATFADE JR todavía NO utiliza
 * ningún modelo externo.
 *
 * Primero estamos comprobando:
 *
 * - usuarios
 * - conversaciones
 * - mensajes
 * - persistencia
 *
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


    if (!message || !String(message).trim()) {

      return res.status(400).json({
        status: "error",
        message: "message es obligatorio"
      });
    }


    /*
     * Usuario
     */
    const user = await getOrCreateUser(
      String(userId),
      name
    );


    /*
     * Conversación
     */
    let conversation;


    if (conversationId) {

      const existingConversation = await pool.query(
        `
          SELECT id, user_id, title
          FROM chatfade_jr.conversations
          WHERE id = $1
            AND user_id = $2
        `,
        [
          conversationId,
          user.id
        ]
      );


      if (existingConversation.rows.length === 0) {

        return res.status(404).json({
          status: "error",
          message: "Conversación no encontrada"
        });
      }


      conversation = existingConversation.rows[0];

    } else {

      let title = String(message)
        .trim()
        .substring(0, 80);


      conversation = await createConversation(
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
      String(message).trim()
    );


    /*
     * =====================================================
     * RESPUESTA TEMPORAL DE CHATFADE JR
     * =====================================================
     *
     * Todavía no conectamos el modelo.
     *
     * Esta respuesta sirve para comprobar que
     * la memoria funciona correctamente.
     */
    const answer =
      `Te escuché${user.name ? ", " + user.name : ""}. ` +
      `Dijiste: "${String(message).trim()}". ` +
      `Ya guardé este mensaje en mi memoria.`;


    /*
     * Guardar respuesta
     */
    await saveMessage(
      conversation.id,
      "assistant",
      answer
    );


    res.json({
      status: "ok",

      assistant: {
        name: "CHATFADE JR",
        version: "0.3.0"
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

      response: answer
    });


  } catch (error) {

    console.error("Error /chat:", error);

    res.status(500).json({
      status: "error",
      message: "CHATFADE JR tuvo un problema procesando el mensaje"
    });
  }

});


/*
 * =========================================================
 * HISTORIAL DE CONVERSACIÓN
 * =========================================================
 */
app.get("/conversations/:conversationId/messages", async (req, res) => {

  try {

    const conversationId = Number(
      req.params.conversationId
    );


    if (!conversationId) {

      return res.status(400).json({
        status: "error",
        message: "conversationId inválido"
      });
    }


    const messages = await pool.query(
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
      conversationId: conversationId,
      messages: messages.rows
    });


  } catch (error) {

    console.error(
      "Error obteniendo conversación:",
      error
    );


    res.status(500).json({
      status: "error",
      message: "No fue posible obtener la conversación"
    });
  }

});


/*
 * =========================================================
 * INICIAR CHATFADE JR
 * =========================================================
 */
app.listen(PORT, "0.0.0.0", () => {

  console.log(
    `CHATFADE JR v0.3.0 iniciado en puerto ${PORT}`
  );

});
