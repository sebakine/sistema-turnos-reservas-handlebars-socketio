/**
 * Bus de emisión en tiempo real desacoplado.
 * Permite que los controllers emitan eventos de dominio mediante Socket.io
 * sin crear dependencias circulares con server.js.
 */
let ioInstance = null;

/** Registra la instancia activa de Socket.io. */
export const setSocketServer = (io) => {
  ioInstance = io;
};

/** Devuelve la instancia activa de Socket.io (o null si no se inicializó). */
export const getSocketServer = () => ioInstance;

/** Emite un evento a todos los clientes conectados si Socket.io está activo. */
export const emitRealtimeEvent = (eventName, payload) => {
  if (!ioInstance) return;
  ioInstance.emit(eventName, payload);
};
