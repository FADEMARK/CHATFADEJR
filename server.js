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

app.get("/", (req, res) => {
  res.json({
    name: "CHATFADE JR",
    version: "0.1.0",
    status: "online",
    message: "Hola. Soy CHATFADE JR."
  });
});

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "chatfade-jr",
    timestamp: new Date().toISOString()
  });
});

// Solo comprueba la conexión.
// NO crea, modifica ni elimina tablas.
app.get("/db-test", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT NOW() AS database_time, current_database() AS database_name"
    );

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

app.listen(PORT, "0.0.0.0", () => {
  console.log(`CHATFADE JR iniciado en puerto ${PORT}`);
});
