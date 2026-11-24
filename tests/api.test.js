import http from "node:http";
import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { io as createSocketClient } from "socket.io-client";
import app from "../src/app.js";
import { connectDB, disconnectDB } from "../src/config/db.config.js";
import { initSocket } from "../src/config/socket.config.js";
import ServiceModel from "../src/models/service.model.js";
import BookingModel from "../src/models/booking.model.js";
import MessageModel from "../src/models/message.model.js";

let mongoServer;
let httpServer;
let ioServer;
let baseUrl;

const request = async (path, options = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  const body = await response.json();
  return { status: response.status, body };
};

const requestText = async (path) => {
  const response = await fetch(`${baseUrl}${path}`);
  const text = await response.text();
  return { status: response.status, contentType: response.headers.get("content-type") || "", text };
};

const waitForSocketEvent = (socket, eventName, timeoutMs = 4000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout esperando el evento Socket.io "${eventName}"`));
    }, timeoutMs);
    socket.once(eventName, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

describe("Sistema Backend de Turnos y Reservas (API REST + MongoDB + Handlebars + Socket.io)", () => {
  before(async () => {
    mongoServer = await MongoMemoryServer.create();
    await connectDB(mongoServer.getUri());

    httpServer = http.createServer(app);
    ioServer = initSocket(httpServer);
    app.set("io", ioServer);

    await new Promise((resolve) => {
      httpServer.listen(0, "127.0.0.1", () => {
        const { port } = httpServer.address();
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  beforeEach(async () => {
    await Promise.all([
      ServiceModel.deleteMany({}),
      BookingModel.deleteMany({}),
      MessageModel.deleteMany({}),
    ]);
  });

  after(async () => {
    ioServer?.close();
    if (httpServer) await new Promise((resolve) => httpServer.close(resolve));
    await disconnectDB();
    if (mongoServer) await mongoServer.stop();
  });

  describe("Rutas base y errores globales", () => {
    it("GET / devuelve información general, recursos API y rutas de vistas", async () => {
      const { status, body } = await request("/");
      assert.equal(status, 200);
      assert.equal(body.status, "success");
      assert.deepEqual(body.resources, ["/api/services", "/api/bookings", "/api/messages"]);
      assert.deepEqual(body.views, ["/views/services", "/views/availability", "/views/bookings"]);
    });

    it("Devuelve 404 ante una ruta inexistente y 400 ante JSON mal formado", async () => {
      const missing = await request("/api/inexistente");
      assert.equal(missing.status, 404);

      const response = await fetch(`${baseUrl}/api/services`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{ json invalido",
      });
      assert.equal(response.status, 400);
    });
  });

  describe("API REST /api/services (sin cambios en el contrato externo)", () => {
    const sampleService = {
      name: "Control dental",
      description: "Revisión y limpieza dental completa",
      duration: 40,
      price: 30000,
      category: "SALUD",
      available: true,
    };

    it("CRUD completo de /api/services con filtros y validaciones", async () => {
      const created = await request("/api/services", {
        method: "POST",
        body: JSON.stringify(sampleService),
      });
      assert.equal(created.status, 201);
      const sid = created.body.payload._id;
      assert.equal(created.body.payload.category, "salud");

      const list = await request("/api/services?category=salud&available=true");
      assert.equal(list.status, 200);
      assert.equal(list.body.count, 1);

      const single = await request(`/api/services/${sid}`);
      assert.equal(single.status, 200);
      assert.equal(single.body.payload.name, "Control dental");

      const updated = await request(`/api/services/${sid}`, {
        method: "PUT",
        body: JSON.stringify({ available: false, price: 27000 }),
      });
      assert.equal(updated.status, 200);
      assert.equal(updated.body.payload.available, false);
      assert.equal(updated.body.payload.price, 27000);

      const deleted = await request(`/api/services/${sid}`, { method: "DELETE" });
      assert.equal(deleted.status, 200);

      const notFound = await request(`/api/services/${sid}`);
      assert.equal(notFound.status, 404);
    });
  });

  describe("API REST /api/bookings y /api/messages", () => {
    it("Mantiene referencias ObjectId en bookings, incremento de quantity y persistencia de messages", async () => {
      const serviceRes = await request("/api/services", {
        method: "POST",
        body: JSON.stringify({
          name: "Consulta médica",
          description: "Evaluación general",
          duration: 30,
          price: 25000,
          category: "salud",
          available: true,
        }),
      });
      const sid = serviceRes.body.payload._id;

      const bookingRes = await request("/api/bookings", {
        method: "POST",
        body: JSON.stringify({
          clientName: "Juan Pérez",
          clientEmail: "juan@example.com",
          date: "2026-10-20",
          time: "16:00",
          services: [{ service: sid, quantity: 1 }],
        }),
      });
      assert.equal(bookingRes.status, 201);
      const bid = bookingRes.body.payload._id;

      const docInDb = await BookingModel.findById(bid);
      assert.equal(docInDb.services[0].service instanceof mongoose.Types.ObjectId, true);

      const added = await request(`/api/bookings/${bid}/services/${sid}`, { method: "POST" });
      assert.equal(added.status, 200);
      assert.equal(added.body.payload.services[0].quantity, 2);

      const listBookings = await request("/api/bookings?populate=true");
      assert.equal(listBookings.status, 200);
      assert.equal(listBookings.body.count, 1);
      assert.equal(listBookings.body.payload[0].services[0].service.name, "Consulta médica");

      const msgRes = await request("/api/messages", {
        method: "POST",
        body: JSON.stringify({ user: "juan@example.com", message: "Confirmo turno", booking: bid }),
      });
      assert.equal(msgRes.status, 201);
    });
  });

  describe("Vistas server-side con Handlebars y archivos estáticos", () => {
    it("GET /views/services renderiza datos reales desde MongoDB (nombre, descripción, duración, precio, categoría y disponibilidad)", async () => {
      await request("/api/services", {
        method: "POST",
        body: JSON.stringify({
          name: "Sesión de kinesiología",
          description: "Rehabilitación musculoesquelética personalizada",
          duration: 45,
          price: 18500,
          category: "salud",
          available: true,
        }),
      });

      const { status, contentType, text } = await requestText("/views/services");
      assert.equal(status, 200);
      assert.match(contentType, /text\/html/);
      assert.match(text, /Sesión de kinesiología/);
      assert.match(text, /Rehabilitación musculoesquelética personalizada/);
      assert.match(text, /45 min/);
      assert.match(text, /18\.500/);
      assert.match(text, /salud/);
      assert.match(text, /Disponible/);
      assert.match(text, /\/socket\.io\/socket\.io\.js/);
      assert.match(text, /\/js\/socket\.js/);
      assert.match(text, /\/css\/styles\.css/);
    });

    it("GET /views/availability y GET /views/bookings renderizan datos reales de servicios y reservas desde MongoDB", async () => {
      const sRes = await request("/api/services", {
        method: "POST",
        body: JSON.stringify({
          name: "Clase de yoga",
          description: "Clase grupal nivel inicial",
          duration: 60,
          price: 8000,
          category: "bienestar",
          available: false,
        }),
      });
      const sid = sRes.body.payload._id;

      await request("/api/bookings", {
        method: "POST",
        body: JSON.stringify({
          clientName: "María González",
          clientEmail: "maria@example.com",
          date: "2026-11-15",
          time: "10:30",
          services: [{ service: sid, quantity: 2 }],
        }),
      });

      const availability = await requestText("/views/availability");
      assert.equal(availability.status, 200);
      assert.match(availability.contentType, /text\/html/);
      assert.match(availability.text, /Clase de yoga/);
      assert.match(availability.text, /No disponible/);
      assert.match(availability.text, /María González/);
      assert.match(availability.text, /2026-11-15/);
      assert.match(availability.text, /10:30/);

      const bookings = await requestText("/views/bookings");
      assert.equal(bookings.status, 200);
      assert.match(bookings.contentType, /text\/html/);
      assert.match(bookings.text, /María González/);
      assert.match(bookings.text, /Clase de yoga/);
      assert.match(bookings.text, /x2/);
    });

    it("Sirve los archivos estáticos /css/styles.css y /js/socket.js", async () => {
      const css = await requestText("/css/styles.css");
      assert.equal(css.status, 200);
      assert.match(css.contentType, /text\/css/);

      const js = await requestText("/js/socket.js");
      assert.equal(js.status, 200);
      assert.match(js.contentType, /javascript/);
      assert.match(js.text, /service:created/);
      assert.match(js.text, /service:updated/);
      assert.match(js.text, /booking:created/);
    });
  });

  describe("Comunicación en tiempo real con Socket.io ante acciones del sistema", () => {
    it("Emite service:created, service:updated, service:deleted, booking:created y booking:updated en vivo", async () => {
      const clientSocket = createSocketClient(baseUrl, { transports: ["websocket"] });
      await new Promise((resolve, reject) => {
        clientSocket.once("connect", resolve);
        clientSocket.once("connect_error", reject);
      });

      try {
        // 1. Crear servicio -> emite service:created
        const createdEventPromise = waitForSocketEvent(clientSocket, "service:created");
        const serviceRes = await request("/api/services", {
          method: "POST",
          body: JSON.stringify({
            name: "Masaje descontracturante",
            description: "Sesión de 50 minutos",
            duration: 50,
            price: 22000,
            category: "bienestar",
            available: true,
          }),
        });
        const createdPayload = await createdEventPromise;
        assert.equal(createdPayload.name, "Masaje descontracturante");
        assert.equal(createdPayload.available, true);

        const sid = serviceRes.body.payload._id;

        // 2. Cambiar disponibilidad -> emite service:updated
        const updatedEventPromise = waitForSocketEvent(clientSocket, "service:updated");
        await request(`/api/services/${sid}`, {
          method: "PUT",
          body: JSON.stringify({ available: false }),
        });
        const updatedPayload = await updatedEventPromise;
        assert.equal(updatedPayload._id, sid);
        assert.equal(updatedPayload.available, false);

        // 3. Crear reserva -> emite booking:created con servicio populado
        const bookingCreatedPromise = waitForSocketEvent(clientSocket, "booking:created");
        const bookingRes = await request("/api/bookings", {
          method: "POST",
          body: JSON.stringify({
            clientName: "Carlos López",
            clientEmail: "carlos@example.com",
            date: "2026-12-01",
            time: "09:15",
            services: [{ service: sid, quantity: 1 }],
          }),
        });
        const bookingCreatedPayload = await bookingCreatedPromise;
        assert.equal(bookingCreatedPayload.clientName, "Carlos López");
        assert.equal(bookingCreatedPayload.services[0].service.name, "Masaje descontracturante");

        // 4. Agregar servicio a la reserva -> emite booking:updated con quantity incrementada
        const bookingUpdatedPromise = waitForSocketEvent(clientSocket, "booking:updated");
        await request(`/api/bookings/${bookingRes.body.payload._id}/services/${sid}`, { method: "POST" });
        const bookingUpdatedPayload = await bookingUpdatedPromise;
        assert.equal(bookingUpdatedPayload.services[0].quantity, 2);

        // 5. Eliminar servicio -> emite service:deleted
        const deletedEventPromise = waitForSocketEvent(clientSocket, "service:deleted");
        await request(`/api/services/${sid}`, { method: "DELETE" });
        const deletedPayload = await deletedEventPromise;
        assert.equal(deletedPayload._id, sid);
      } finally {
        clientSocket.disconnect();
      }
    });
  });
});
