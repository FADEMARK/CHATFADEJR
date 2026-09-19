import express from "express";
import pg from "pg";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import { brain } from "./src/brain/brain.js";
import { memoryExtractor } from "./src/brain/memory/extractor.js";

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
    version: "0.8.0",
    brain: "enabled",
    memoryEngine: "enabled",
    timestamp: new Date().toISOString()
  });
});


/*
 * =========================================================
 * PREPARAR BASE
 * =========================================================
 */

async function ensureDatabase() {

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

  const header =
    req.headers.authorization;

  if (!header) {

    return res.status(401).json({
      status: "error",
      message: "Token requerido"
    });
  }


  const parts =
    header.split(" ");


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

    req.auth =
      jwt.verify(
        parts[1],
        JWT_SECRET
      );

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


    if (!name?.trim()) {

      return res.status(400).json({
        status: "error",
        message: "Nombre requerido"
      });
    }


    if (!email?.trim()) {

      return res.status(400).json({
        status: "error",
        message: "Correo requerido"
      });
    }


    if (
      !password ||
      password.length < 8
    ) {

      return res.status(400).json({
        status: "error",
        message:
          "La contraseña debe tener al menos 8 caracteres"
      });
    }


    const normalizedEmail =
      email
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


    const result =
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
          name.trim(),
          normalizedEmail,
          passwordHash
        ]
      );


    const user =
      result.rows[0];


    res.status(201).json({
      status: "ok",
      token: createToken(user),
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    });


  } catch (error) {

    console.error(
      "Register error:",
      error
    );


    res.status(500).json({
      status: "error",
      message:
        "No fue posible crear la cuenta"
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


    if (
      !email ||
      !password
    ) {

      return res.status(400).json({
        status: "error",
        message:
          "Correo y contraseña requeridos"
      });
    }


    const normalizedEmail =
      email
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
        message:
          "Correo o contraseña incorrectos"
      });
    }


    const user =
      result.rows[0];


    const valid =
      await bcrypt.compare(
        password,
        user.password_hash || ""
      );


    if (!valid) {

      return res.status(401).json({
        status: "error",
        message:
          "Correo o contraseña incorrectos"
      });
    }


    res.json({
      status: "ok",
      token: createToken(user),
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    });


  } catch (error) {

    console.error(
      "Login error:",
      error
    );


    res.status(500).json({
      status: "error",
      message:
        "No fue posible iniciar sesión"
    });
  }
});


/*
 * =========================================================
 * CURRENT USER
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
          [
            req.auth.userId
          ]
        );


      if (
        result.rows.length === 0
      ) {

        return res.status(404).json({
          status: "error",
          message:
            "Usuario no encontrado"
        });
      }


      res.json({
        status: "ok",
        user: result.rows[0]
      });


    } catch (error) {

      res.status(500).json({
        status: "error",
        message:
          "No fue posible obtener el usuario"
      });
    }
  }
);


/*
 * =========================================================
 * USER
 * =========================================================
 */

async function getUser(
  userId
) {

  const result =
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
      [userId]
    );


  return result.rows[0] || null;
}


/*
 * =========================================================
 * CONVERSATIONS
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
          [
            req.auth.userId
          ]
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
 * MESSAGES
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
    [
      conversationId
    ]
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
      [
        conversationId
      ]
    );


  return result.rows;
}


/*
 * =========================================================
 * MEMORIES
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
          updated_at DESC
        LIMIT 50
      `,
      [
        userId
      ]
    );


  return result.rows;
}


/*
 * =========================================================
 * UPSERT MEMORY
 * =========================================================
 */

async function upsertMemory(
  userId,
  key,
  value,
  importance = 5,
  source = "ai_extractor"
) {

  /*
   * Recuerdos explícitos pueden existir varias veces.
   */

  if (
    key !==
    "explicit_memory"
  ) {

    const existing =
      await pool.query(
        `
          SELECT id
          FROM chatfade_jr.memories
          WHERE user_id = $1
            AND memory_key = $2
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
        SELECT *
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


  if (
    duplicate.rows.length > 0
  ) {

    return duplicate.rows[0];
  }


  /*
   * Crear memoria.
   */

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
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5
        )
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
 * MEMORY ENGINE
 * =========================================================
 */

async function extractMemoriesSafely(
  user,
  message,
  existingMemories
) {

  try {

    /*
     * Para saludos y mensajes extremadamente cortos
     * evitamos una segunda inferencia innecesaria.
     */

    const clean =
      String(message)
        .trim();


    if (
      clean.length < 4
    ) {

      return [];
    }


    const normalized =
      clean.toLowerCase();


    const trivialMessages = [
      "hola",
      "hello",
      "hey",
      "gracias",
      "ok",
      "okay",
      "si",
      "sí",
      "no"
    ];


    if (
      trivialMessages.includes(
        normalized
      )
    ) {

      return [];
    }


    const extracted =
      await memoryExtractor.extract({
        message:
          clean,

        existingMemories
      });


    if (
      !Array.isArray(
        extracted
      )
    ) {

      return [];
    }


    return extracted;


  } catch (error) {

    console.error(
      "Memory extractor error:",
      error.message
    );


    /*
     * El chat continúa aunque falle
     * la memoria.
     */

    return [];
  }
}


/*
 * =========================================================
 * SAVE EXTRACTED MEMORIES
 * =========================================================
 */

async function saveExtractedMemories(
  userId,
  extractedMemories
) {

  const saved = [];


  for (
    const memory
    of extractedMemories
  ) {

    try {

      const result =
        await upsertMemory(
          userId,
          memory.key,
          memory.value,
          memory.importance,
          "ai_extractor"
        );


      saved.push(
        result
      );


    } catch (error) {

      console.error(
        "Error saving memory:",
        memory,
        error
      );
    }
  }


  return saved;
}


/*
 * =========================================================
 * CHAT
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


      const userMessage =
        String(message)
          .trim();


      /*
       * Usuario
       */

      const user =
        await getUser(
          req.auth.userId
        );


      if (!user) {

        return res.status(401).json({
          status: "error",
          message:
            "Usuario no encontrado"
        });
      }


      /*
       * Conversación
       */

      let conversation;


      if (
        conversationId
      ) {

        conversation =
          await getConversation(
            Number(
              conversationId
            ),
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
            userMessage.substring(
              0,
              80
            )
          );
      }


      /*
       * Guardar mensaje.
       */

      await saveMessage(
        conversation.id,
        "user",
        userMessage
      );


      /*
       * ===================================================
       * MEMORIA ACTUAL
       * ===================================================
       */

      let memories =
        await getMemories(
          user.id
        );


      /*
       * ===================================================
       * EXTRAER NUEVAS MEMORIAS
       * ===================================================
       */

      const extractedMemories =
        await extractMemoriesSafely(
          user,
          userMessage,
          memories
        );


      /*
       * Guardarlas.
       */

      const savedMemories =
        await saveExtractedMemories(
          user.id,
          extractedMemories
        );


      /*
       * Si hubo nuevas memorias,
       * recargar lista.
       */

      if (
        savedMemories.length > 0
      ) {

        memories =
          await getMemories(
            user.id
          );
      }


      /*
       * ===================================================
       * HISTORIAL
       * ===================================================
       */

      const history =
        await getConversationContext(
          conversation.id
        );


      /*
       * ===================================================
       * BRAIN
       * ===================================================
       */

      const brainResponse =
        await brain.respond({

          user,

          message:
            userMessage,

          history,

          memories

        });


      let answer =
        brainResponse.text;


      /*
       * Confirmación discreta.
       *
       * No mostramos detalles internos
       * de keys al usuario.
       */

      if (
        savedMemories.length > 0
      ) {

        answer +=
          "\n\nLo tendré en cuenta para futuras conversaciones.";
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
       * RESPUESTA API
       */

      res.json({
        status: "ok",

        assistant: {
          name:
            "CHATFADE JR",

          version:
            "0.8.0"
        },

        brain: {

          provider:
            brainResponse.provider ||
            null,

          model:
            brainResponse.model ||
            null,

          evalCount:
            brainResponse.evalCount ||
            null

        },

        conversation: {

          id:
            conversation.id,

          title:
            conversation.title

        },

        memory: {

          extracted:
            extractedMemories.length,

          saved:
            savedMemories.length

        },

        response:
          answer
      });


    } catch (error) {

      console.error(
        "CHAT ERROR:",
        error
      );


      res.status(500).json({
        status: "error",
        message:
          "CHATFADE JR tuvo un problema procesando tu mensaje."
      });
    }
  }
);


/*
 * =========================================================
 * CONVERSATION MESSAGES
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

        return res.status(404).json({
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
 * MEMORIES
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
        total:
          memories.length,
        memories
      });


    } catch (error) {

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

    await ensureDatabase();


    app.listen(
      PORT,
      "0.0.0.0",
      () => {

        console.log(
          `CHATFADE JR v0.8.0 iniciado en puerto ${PORT}`
        );

        console.log(
          `Brain URL: ${process.env.BRAIN_BASE_URL || "NO CONFIGURADO"}`
        );

        console.log(
          `Brain Model: ${process.env.BRAIN_MODEL || "NO CONFIGURADO"}`
        );

      }
    );


  } catch (error) {

    console.error(
      "Startup error:",
      error
    );

    process.exit(1);
  }
}


startServer();
