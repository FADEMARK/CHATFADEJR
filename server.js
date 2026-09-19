import express from "express";
import pg from "pg";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import { brain } from "./src/brain/brain.js";

const { Pool } = pg;

const app = express();

app.use(express.json());
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error("Falta JWT_SECRET");
  process.exit(1);
}

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
    version: "0.7.3",
    brain: "enabled",
    timestamp: new Date().toISOString()
  });
});


/*
 * =========================================================
 * PREPARAR COLUMNAS DE AUTENTICACION
 * =========================================================
 */

async function ensureAuthColumns() {

  await pool.query(`
    ALTER TABLE chatfade_jr.users
    ADD COLUMN IF NOT EXISTS email VARCHAR(320)
  `);

  await pool.query(`
    ALTER TABLE chatfade_jr.users
    ADD COLUMN IF NOT EXISTS password_hash TEXT
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_chatfade_users_email
    ON chatfade_jr.users (LOWER(email))
    WHERE email IS NOT NULL
  `);
}


/*
 * =========================================================
 * JWT
 * =========================================================
 */

function createToken(user) {

  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      name: user.name
    },
    JWT_SECRET,
    {
      expiresIn: "7d"
    }
  );
}


function authMiddleware(req, res, next) {

  const authHeader =
    req.headers.authorization;

  if (!authHeader) {

    return res.status(401).json({
      status: "error",
      message: "Token requerido"
    });
  }

  const parts =
    authHeader.split(" ");

  if (
    parts.length !== 2 ||
    parts[0] !== "Bearer"
  ) {

    return res.status(401).json({
      status: "error",
      message: "Token inválido"
    });
  }

  try {

    const decoded =
      jwt.verify(
        parts[1],
        JWT_SECRET
      );

    req.auth = decoded;

    next();

  } catch (error) {

    return res.status(401).json({
      status: "error",
      message: "Sesión inválida o expirada"
    });
  }
}


/*
 * =========================================================
 * REGISTER
 * =========================================================
 */

app.post("/auth/register", async (req, res) => {

  try {

    const {
      name,
      email,
      password
    } = req.body;

    if (!name || !String(name).trim()) {

      return res.status(400).json({
        status: "error",
        message: "Nombre requerido"
      });
    }

    if (!email || !String(email).trim()) {

      return res.status(400).json({
        status: "error",
        message: "Correo requerido"
      });
    }

    if (!password || password.length < 8) {

      return res.status(400).json({
        status: "error",
        message: "La contraseña debe tener al menos 8 caracteres"
      });
    }

    const normalizedEmail =
      String(email)
        .trim()
        .toLowerCase();

    const existing =
      await pool.query(
        `
          SELECT id
          FROM chatfade_jr.users
          WHERE LOWER(email) = $1
          LIMIT 1
        `,
        [normalizedEmail]
      );

    if (
      existing.rows.length > 0
    ) {

      return res.status(409).json({
        status: "error",
        message: "Ese correo ya está registrado"
      });
    }

    const passwordHash =
      await bcrypt.hash(
        password,
        12
      );

    const externalId =
      `user_${Date.now()}_${Math.random()
        .toString(36)
        .substring(2, 10)}`;

    const created =
      await pool.query(
        `
          INSERT INTO chatfade_jr.users (
            external_id,
            name,
            email,
            password_hash
          )
          VALUES ($1, $2, $3, $4)
          RETURNING
            id,
            external_id,
            name,
            email,
            created_at
        `,
        [
          externalId,
          String(name).trim(),
          normalizedEmail,
          passwordHash
        ]
      );

    const user =
      created.rows[0];

    const token =
      createToken(user);

    res.status(201).json({
      status: "ok",
      message: "Cuenta creada correctamente",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    });

  } catch (error) {

    console.error(
      "Error register:",
      error
    );

    res.status(500).json({
      status: "error",
      message: "No fue posible crear la cuenta"
    });
  }
});


/*
 * =========================================================
 * LOGIN
 * =========================================================
 */

app.post("/auth/login", async (req, res) => {

  try {

    const {
      email,
      password
    } = req.body;

    if (!email || !password) {

      return res.status(400).json({
        status: "error",
        message: "Correo y contraseña requeridos"
      });
    }

    const normalizedEmail =
      String(email)
        .trim()
        .toLowerCase();

    const result =
      await pool.query(
        `
          SELECT
            id,
            external_id,
            name,
            email,
            password_hash
          FROM chatfade_jr.users
          WHERE LOWER(email) = $1
          LIMIT 1
        `,
        [normalizedEmail]
      );

    if (
      result.rows.length === 0
    ) {

      return res.status(401).json({
        status: "error",
        message: "Correo o contraseña incorrectos"
      });
    }

    const user =
      result.rows[0];

    const validPassword =
      await bcrypt.compare(
        password,
        user.password_hash || ""
      );

    if (!validPassword) {

      return res.status(401).json({
        status: "error",
        message: "Correo o contraseña incorrectos"
      });
    }

    const token =
      createToken(user);

    res.json({
      status: "ok",
      message: "Sesión iniciada",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    });

  } catch (error) {

    console.error(
      "Error login:",
      error
    );

    res.status(500).json({
      status: "error",
      message: "No fue posible iniciar sesión"
    });
  }
});


/*
 * =========================================================
 * USUARIO ACTUAL
 * =========================================================
 */

app.get(
  "/auth/me",
  authMiddleware,
  async (req, res) => {

    try {

      const result =
        await pool.query(
          `
            SELECT
              id,
              external_id,
              name,
              email,
              created_at
            FROM chatfade_jr.users
            WHERE id = $1
          `,
          [req.auth.userId]
        );

      if (
        result.rows.length === 0
      ) {

        return res.status(404).json({
          status: "error",
          message: "Usuario no encontrado"
        });
      }

      res.json({
        status: "ok",
        user: result.rows[0]
      });

    } catch (error) {

      console.error(
        "Error /auth/me:",
        error
      );

      res.status(500).json({
        status: "error",
        message: "No fue posible obtener el usuario"
      });
    }
  }
);


/*
 * =========================================================
 * CONVERSACIONES
 * =========================================================
 */

async function createConversation(
  userId,
  title
) {

  const result =
    await pool.query(
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


async function getConversation(
  conversationId,
  userId
) {

  const result =
    await pool.query(
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


app.get(
  "/conversations",
  authMiddleware,
  async (req, res) => {

    try {

      const result =
        await pool.query(
          `
            SELECT
              id,
              title,
              created_at,
              updated_at
            FROM chatfade_jr.conversations
            WHERE user_id = $1
            ORDER BY updated_at DESC
          `,
          [req.auth.userId]
        );

      res.json({
        status: "ok",
        conversations: result.rows
      });

    } catch (error) {

      console.error(
        "Error conversations:",
        error
      );

      res.status(500).json({
        status: "error",
        message: "No fue posible obtener conversaciones"
      });
    }
  }
);


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

  const result =
    await pool.query(
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

  const result =
    await pool.query(
      `
        SELECT
          role,
          content,
          created_at
        FROM chatfade_jr.messages
        WHERE conversation_id = $1
        ORDER BY
          created_at ASC,
          id ASC
        LIMIT 30
      `,
      [conversationId]
    );

  return result.rows;
}


/*
 * =========================================================
 * MEMORIAS
 * =========================================================
 */

async function getMemories(
  userId
) {

  const result =
    await pool.query(
      `
        SELECT
          id,
          memory_key,
          memory_value,
          importance,
          source,
          created_at,
          updated_at
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


async function upsertMemory(
  userId,
  key,
  value,
  importance = 5,
  source = "conversation"
) {

  /*
   * Para claves conocidas, sustituimos
   * el valor anterior.
   */

  if (
    key !== "explicit_memory"
  ) {

    const existing =
      await pool.query(
        `
          SELECT id
          FROM chatfade_jr.memories
          WHERE user_id = $1
            AND memory_key = $2
          ORDER BY updated_at DESC
          LIMIT 1
        `,
        [
          userId,
          key
        ]
      );

    if (
      existing.rows.length > 0
    ) {

      const updated =
        await pool.query(
          `
            UPDATE chatfade_jr.memories
            SET
              memory_value = $1,
              importance = $2,
              source = $3,
              updated_at = NOW()
            WHERE id = $4
            RETURNING *
          `,
          [
            value,
            importance,
            source,
            existing.rows[0].id
          ]
        );

      return updated.rows[0];
    }
  }


  /*
   * Evitar duplicados exactos.
   */

  const duplicate =
    await pool.query(
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

  if (
    duplicate.rows.length > 0
  ) {

    return duplicate.rows[0];
  }


  const result =
    await pool.query(
      `
        INSERT INTO chatfade_jr.memories (
          user_id,
          memory_key,
          memory_value,
          importance,
          source
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
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


/*
 * =========================================================
 * DETECCION LOCAL DE MEMORIA
 * =========================================================
 *
 * Seguimos conservando esta capa aunque Qwen ya responda.
 * Después haremos extracción semántica con el propio modelo.
 */

async function detectAndSaveMemory(
  user,
  message
) {

  const text =
    message.trim();

  const lower =
    text.toLowerCase();


  /*
   * Memoria explícita
   */

  if (
    lower.startsWith("recuerda que ") ||
    lower.startsWith("quiero que recuerdes que ")
  ) {

    const value =
      text
        .replace(
          /^recuerda que\s+/i,
          ""
        )
        .replace(
          /^quiero que recuerdes que\s+/i,
          ""
        )
        .trim();

    if (value) {

      await upsertMemory(
        user.id,
        "explicit_memory",
        value,
        9,
        "user"
      );

      return {
        saved: true,
        key: "explicit_memory",
        value
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
        .replace(
          /[.!?]+$/,
          ""
        )
        .trim();

    await upsertMemory(
      user.id,
      "favorite_color",
      color,
      8,
      "user"
    );

    return {
      saved: true,
      key: "favorite_color",
      value: color
    };
  }


  /*
   * Equipo favorito / le voy a...
   */

  const teamMatch =
    text.match(
      /(?:le voy al|le voy a|mi equipo favorito es)\s+(.+)/i
    );

  if (teamMatch) {

    const team =
      teamMatch[1]
        .replace(
          /[.!?]+$/,
          ""
        )
        .trim();

    await upsertMemory(
      user.id,
      "favorite_team",
      team,
      8,
      "user"
    );

    return {
      saved: true,
      key: "favorite_team",
      value: team
    };
  }


  return {
    saved: false
  };
}


/*
 * =========================================================
 * CHAT CON BRAIN / QWEN
 * =========================================================
 */

app.post(
  "/chat",
  authMiddleware,
  async (req, res) => {

    try {

      const {
        message,
        conversationId
      } = req.body;


      if (
        !message ||
        !String(message).trim()
      ) {

        return res.status(400).json({
          status: "error",
          message: "message es obligatorio"
        });
      }


      const userResult =
        await pool.query(
          `
            SELECT
              id,
              external_id,
              name,
              email
            FROM chatfade_jr.users
            WHERE id = $1
          `,
          [req.auth.userId]
        );


      if (
        userResult.rows.length === 0
      ) {

        return res.status(401).json({
          status: "error",
          message: "Usuario no encontrado"
        });
      }


      const user =
        userResult.rows[0];


      const userMessage =
        String(message).trim();


      let conversation;


      /*
       * Conversación existente.
       */

      if (conversationId) {

        conversation =
          await getConversation(
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

        /*
         * Nueva conversación.
         */

        conversation =
          await createConversation(
            user.id,
            userMessage.substring(
              0,
              80
            )
          );
      }


      /*
       * Guardar mensaje del usuario.
       */

      await saveMessage(
        conversation.id,
        "user",
        userMessage
      );


      /*
       * Intentar detectar memoria estructurada.
       */

      const memoryResult =
        await detectAndSaveMemory(
          user,
          userMessage
        );


      /*
       * Recuperar historial.
       */

      const history =
        await getConversationContext(
          conversation.id
        );


      /*
       * Recuperar memoria permanente.
       */

      const memories =
        await getMemories(
          user.id
        );


      /*
       * ===================================================
       * BRAIN
       * ===================================================
       */

      const brainResponse =
        await brain.respond({
          user,
          message: userMessage,
          history,
          memories
        });


      let answer =
        brainResponse.text;


      /*
       * Si guardamos explícitamente una memoria,
       * podemos confirmarlo sin reemplazar
       * completamente la respuesta del modelo.
       */

      if (
        memoryResult.saved
      ) {

        answer +=
          `\n\nHe guardado ese dato en tu memoria.`;
      }


      /*
       * Guardar respuesta.
       */

      await saveMessage(
        conversation.id,
        "assistant",
        answer
      );


      /*
       * Respuesta API.
       */

      res.json({
        status: "ok",

        assistant: {
          name: "CHATFADE JR",
          version: "0.7.3"
        },

        brain: {
          provider:
            brainResponse.provider || null,

          model:
            brainResponse.model || null,

          evalCount:
            brainResponse.evalCount || null
        },

        user: {
          id: user.id,
          name: user.name,
          email: user.email
        },

        conversation: {
          id: conversation.id,
          title: conversation.title
        },

        memory: {
          savedThisTurn:
            memoryResult.saved,

          key:
            memoryResult.key || null
        },

        response:
          answer
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
  }
);


/*
 * =========================================================
 * MENSAJES DE CONVERSACION
 * =========================================================
 */

app.get(
  "/conversations/:conversationId/messages",
  authMiddleware,
  async (req, res) => {

    try {

      const conversation =
        await getConversation(
          Number(
            req.params.conversationId
          ),
          req.auth.userId
        );


      if (!conversation) {

        return res.status(404).json({
          status: "error",
          message: "Conversación no encontrada"
        });
      }


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
            ORDER BY
              created_at ASC,
              id ASC
          `,
          [
            conversation.id
          ]
        );


      res.json({
        status: "ok",
        conversationId:
          conversation.id,
        messages:
          result.rows
      });


    } catch (error) {

      console.error(
        "Error messages:",
        error
      );


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
 * MEMORIA DEL USUARIO
 * =========================================================
 */

app.get(
  "/memories",
  authMiddleware,
  async (req, res) => {

    try {

      const memories =
        await getMemories(
          req.auth.userId
        );


      res.json({
        status: "ok",
        total: memories.length,
        memories
      });


    } catch (error) {

      console.error(
        "Error memories:",
        error
      );


      res.status(500).json({
        status: "error",
        message:
          "No fue posible obtener la memoria"
      });
    }
  }
);


/*
 * =========================================================
 * START
 * =========================================================
 */

async function startServer() {

  try {

    await ensureAuthColumns();


    app.listen(
      PORT,
      "0.0.0.0",
      () => {

        console.log(
          `CHATFADE JR v0.7.3 iniciado en puerto ${PORT}`
        );

        console.log(
          `Brain URL: ${process.env.BRAIN_BASE_URL || "no configurado"}`
        );

        console.log(
          `Brain Model: ${process.env.BRAIN_MODEL || "no configurado"}`
        );

      }
    );


  } catch (error) {

    console.error(
      "Error inicializando CHATFADE JR:",
      error
    );

    process.exit(1);
  }
}


startServer();
