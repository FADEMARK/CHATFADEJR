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
    version: "0.6.0",
    auth: "enabled",
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
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      status: "error",
      message: "Token requerido"
    });
  }

  const parts = authHeader.split(" ");

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
    const decoded = jwt.verify(
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

    const existing = await pool.query(
      `
        SELECT id
        FROM chatfade_jr.users
        WHERE LOWER(email) = $1
        LIMIT 1
      `,
      [normalizedEmail]
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({
        status: "error",
        message: "Ese correo ya está registrado"
      });
    }

    const passwordHash =
      await bcrypt.hash(password, 12);

    const externalId =
      `user_${Date.now()}_${Math.random()
        .toString(36)
        .substring(2, 10)}`;

    const created = await pool.query(
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

    const user = created.rows[0];

    const token =
      createToken(user);

    res.status(201).json({
      status: "ok",
      message: "Cuenta creada correctamente",
      token: token,
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

    const result = await pool.query(
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

    if (result.rows.length === 0) {
      return res.status(401).json({
        status: "error",
        message: "Correo o contraseña incorrectos"
      });
    }

    const user = result.rows[0];

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
      token: token,
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
      const result = await pool.query(
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

      if (result.rows.length === 0) {
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
      const result = await pool.query(
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
        conversations:
          result.rows
      });

    } catch (error) {
      res.status(500).json({
        status: "error",
        message:
          "No fue posible obtener conversaciones"
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

async function getMemories(userId) {
  const result =
    await pool.query(
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


async function saveMemory(
  userId,
  key,
  value,
  importance = 5,
  source = "conversation"
) {
  const existing =
    await pool.query(
      `
        SELECT id
        FROM chatfade_jr.memories
        WHERE user_id = $1
          AND LOWER(memory_value) =
              LOWER($2)
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


async function detectAndSaveMemory(
  user,
  message
) {
  const text = message.trim();

  const lower =
    text.toLowerCase();

  if (
    lower.startsWith(
      "recuerda que "
    ) ||
    lower.startsWith(
      "quiero que recuerdes que "
    )
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
      await saveMemory(
        user.id,
        "explicit_memory",
        value,
        9,
        "user"
      );

      return {
        saved: true,
        value
      };
    }
  }

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

    await saveMemory(
      user.id,
      "favorite_color",
      color,
      8,
      "user"
    );

    return {
      saved: true,
      value:
        `Tu color favorito es ${color}`
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
    userMessage
      .toLowerCase();

  const memories =
    await getMemories(
      user.id
    );

  if (
    lower.includes(
      "cómo me llamo"
    ) ||
    lower.includes(
      "como me llamo"
    )
  ) {
    return user.name
      ? `Te llamas ${user.name}.`
      : "Todavía no sé cómo te llamas.";
  }

  if (
    lower.includes(
      "qué recuerdas de mí"
    ) ||
    lower.includes(
      "que recuerdas de mi"
    ) ||
    lower.includes(
      "qué sabes de mí"
    ) ||
    lower.includes(
      "que sabes de mi"
    )
  ) {
    if (
      memories.length === 0
    ) {
      return (
        "Todavía no tengo recuerdos permanentes sobre ti."
      );
    }

    return (
      "Tengo estos recuerdos sobre ti: " +
      memories
        .map(
          memory =>
            memory.memory_value
        )
        .join(" | ")
    );
  }

  if (
    lower.includes(
      "cuál es mi color favorito"
    ) ||
    lower.includes(
      "cual es mi color favorito"
    )
  ) {
    const memory =
      memories.find(
        item =>
          item.memory_key ===
          "favorite_color"
      );

    if (memory) {
      return (
        `Tu color favorito es ${memory.memory_value}.`
      );
    }

    return (
      "Todavía no me has dicho cuál es tu color favorito."
    );
  }

  return (
    `Estoy aprendiendo contigo, ${user.name}. ` +
    `Recibí tu mensaje: "${userMessage}"`
  );
}


/*
 * =========================================================
 * CHAT PROTEGIDO
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
          message:
            "message es obligatorio"
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
          message:
            "Usuario no encontrado"
        });
      }

      const user =
        userResult.rows[0];

      const userMessage =
        String(message).trim();

      let conversation;

      if (conversationId) {
        conversation =
          await getConversation(
            Number(
              conversationId
            ),
            user.id
          );

        if (!conversation) {
          return res
            .status(404)
            .json({
              status: "error",
              message:
                "Conversación no encontrada"
            });
        }

      } else {
        conversation =
          await createConversation(
            user.id,
            userMessage.substring(
              0,
              80
            )
          );
      }

      await saveMessage(
        conversation.id,
        "user",
        userMessage
      );

      const memoryResult =
        await detectAndSaveMemory(
          user,
          userMessage
        );

      const history =
        await getConversationContext(
          conversation.id
        );

      let answer;

      if (
        memoryResult.saved
      ) {
        answer =
          `Lo recordaré, ${user.name}: ${memoryResult.value}.`;
      } else {
        answer =
          await generateLocalResponse(
            history,
            userMessage,
            user
          );
      }

      await saveMessage(
        conversation.id,
        "assistant",
        answer
      );

      res.json({
        status: "ok",

        assistant: {
          name: "CHATFADE JR",
          version: "0.6.0"
        },

        user: {
          id: user.id,
          name: user.name,
          email: user.email
        },

        conversation: {
          id: conversation.id,
          title:
            conversation.title
        },

        response:
          answer
      });

    } catch (error) {
      console.error(
        "Error chat:",
        error
      );

      res.status(500).json({
        status: "error",
        message:
          "CHATFADE JR tuvo un problema"
      });
    }
  }
);


/*
 * =========================================================
 * MENSAJES PROTEGIDOS
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
            req.params
              .conversationId
          ),
          req.auth.userId
        );

      if (!conversation) {
        return res
          .status(404)
          .json({
            status: "error",
            message:
              "Conversación no encontrada"
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
          `CHATFADE JR v0.6.0 iniciado en puerto ${PORT}`
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
