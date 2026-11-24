import http from "node:http";
import app from "./app.js";
import envConfig from "./config/env.config.js";
import { connectDB, disconnectDB } from "./config/db.config.js";
import { initSocket } from "./config/socket.config.js";

const { PORT } = envConfig;

/** Inicia la conexión a MongoDB Atlas, adjunta Socket.io y levanta el servidor HTTP. */
const startServer = async () => {
  try {
    await connectDB();

    const httpServer = http.createServer(app);
    const io = initSocket(httpServer);
    app.set("io", io);

    httpServer.listen(PORT, () => {
      console.log(`Servidor escuchando en http://localhost:${PORT}`);
      console.log(`Vistas disponibles en http://localhost:${PORT}/views/services`);
    });

    const shutdown = async (signal) => {
      console.log(`Señal ${signal} recibida. Cerrando servidor...`);
      io.close();
      httpServer.close(async () => {
        await disconnectDB();
        process.exit(0);
      });
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  } catch (error) {
    console.error("No se pudo iniciar el servidor:", error.message);
    process.exit(1);
  }
};

startServer();
