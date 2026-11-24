import { Server } from "socket.io";
import { setSocketServer } from "../utils/realtime.js";

/**
 * Inicializa Socket.io sobre el servidor HTTP de Node.js.
 * Los eventos de negocio ("service:created", "service:updated", "service:deleted",
 * "booking:created", "booking:updated") se emiten desde los controllers tras
 * persistir los cambios reales en MongoDB.
 */
export const initSocket = (httpServer) => {
  const io = new Server(httpServer);

  io.on("connection", (socket) => {
    console.log(`Cliente Socket.io conectado: ${socket.id}`);

    socket.on("disconnect", () => {
      console.log(`Cliente Socket.io desconectado: ${socket.id}`);
    });
  });

  setSocketServer(io);
  return io;
};
