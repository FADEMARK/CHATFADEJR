import express from "express";
import pg from "pg";

const { Pool } = pg;

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 3000;

/*
 * Conexión a PostgreSQL
 */
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
    version: "0.1.0",
    status: "online",
    message: "Hola. Soy CHATFADE JR."
  });
});


/*
 * Health Check para Render
 */
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "chatfade-jr",
    timestamp: new Date().toISOString()
  });
});


/*
 * Prueba de conexión PostgreSQL
 *
 * No crea ni modifica información.
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
      message: "No fue posible conectar con PostgreSQL",
      error: error.message
    });
  }
});


/*
 * SETUP inicial de CHATFADE JR
 *
 * Crea un schema independiente dentro de
 * la misma base de datos.
 *
 * No toca las tablas existentes del schema public.
 */
app.get("/setup", async (req, res) => {
  try {

    /*
     * Crear schema independiente.
     */
    await pool.query(`
      CREATE SCHEMA IF NOT EXISTS chatfade_jr
    `);


    /*
     * Verificar que exista.
     */
    const result = await pool.query(`
      SELECT schema_name
      FROM information_schema.schemata
      WHERE schema_name = 'chatfade_jr'
    `);


    res.json({
      status: "ok",
      message: "Schema de CHATFADE JR creado correctamente",
      schema: result.rows[0]?.schema_name || null
    });

  } catch (error) {

    console.error("Error creando schema:", error);

    res.status(500).json({
      status: "error",
      message: "No fue posible crear el schema de CHATFADE JR",
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
