import express from "express";

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 3000;

// Página principal
app.get("/", (req, res) => {
  res.json({
    name: "CHATFADE JR",
    version: "0.1.0",
    status: "online",
    message: "Hola. Soy CHATFADE JR."
  });
});

// Render utilizará esto para comprobar que el servidor está vivo
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "chatfade-jr",
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`CHATFADE JR iniciado en puerto ${PORT}`);
});
