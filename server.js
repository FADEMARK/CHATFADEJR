import express from "express";
import pg from "pg";

const { Pool } = pg;

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

/*
 * Página principal
 */
app.get("/", (req, res) => {
  res.json({
    name: "CHATFADE JR",
    version: "0.2.0",
    status: "online",
    message: "Hola. Soy CHATFADE JR."
  });
});

/*
 * Health Check
 */
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "chatfade-jr",
    timestamp: new Date().toISOString()
  });
});

/*
 * Test de base de datos
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
 * Setup protegido
 */
app.post("/admin/setup-memory", async (req, res) => {
  try {
    const token = req.headers["x-admin-token"];

    if (
      !process.env.SETUP_ADMIN_TOKEN ||
      token !== process.env.SETUP_ADMIN_TOKEN
    ) {
      return res.status(401).json({
        status: "error",
        message: "No autorizado"
      });
    }

    await pool.query(`
      CREATE SCHEMA IF NOT EXISTS chatfade_jr
    `);

    /*
     * USERS
     */
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chatfade_jr.users (
        id BIGSERIAL PRIMARY KEY,
        external_id VARCHAR(150) UNIQUE,
        name VARCHAR(200),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    /*
     * CONVERSATIONS
     */
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chatfade_jr.conversations (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT REFERENCES chatfade_jr.users(id) ON DELETE CASCADE,
        title VARCHAR(300),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    /*
     * MESSAGES
     */
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chatfade_jr.messages (
        id BIGSERIAL PRIMARY KEY,
        conversation_id BIGINT REFERENCES chatfade_jr.conversations(id) ON DELETE CASCADE,
        role VARCHAR(30) NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    /*
     * MEMORIES
     */
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chatfade_jr.memories (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT REFERENCES chatfade_jr.users(id) ON DELETE CASCADE,
        memory_key VARCHAR(200),
        memory_value TEXT NOT NULL,
        importance INTEGER NOT NULL DEFAULT 5,
        source VARCHAR(100),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    /*
     * KNOWLEDGE
     */
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chatfade_jr.knowledge (
        id BIGSERIAL PRIMARY KEY,
        title VARCHAR(300),
        content TEXT NOT NULL,
        category VARCHAR(100),
        source VARCHAR(300),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const result = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'chatfade_jr'
      ORDER BY table_name
    `);

    res.json({
      status: "ok",
      message: "Memoria inicial de CHATFADE JR creada correctamente",
      tables: result.rows.map(row => row.table_name)
    });

  } catch (error) {
    console.error("Error creando memoria:", error);

    res.status(500).json({
      status: "error",
      message: "No fue posible crear la memoria inicial",
      error: error.message
    });
  }
});

/*
 * Iniciar servidor
 */
app.listen(PORT, "0.0.0.0", () => {
  console.log(`CHATFADE JR iniciado en puerto ${PORT}`);
});
