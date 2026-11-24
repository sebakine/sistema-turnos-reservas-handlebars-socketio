import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { engine } from "express-handlebars";
import servicesRouter from "./routes/services.router.js";
import bookingsRouter from "./routes/bookings.router.js";
import messagesRouter from "./routes/messages.router.js";
import viewsRouter from "./routes/views.router.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

// Motor de plantillas Handlebars con helpers de presentación
app.engine(
  "handlebars",
  engine({
    defaultLayout: "main",
    layoutsDir: path.join(__dirname, "views", "layouts"),
    helpers: {
      eq: (a, b) => a === b,
      formatPrice: (price) => {
        const numeric = Number(price);
        if (!Number.isFinite(numeric)) return "$0";
        return `$${numeric.toLocaleString("es-CL")}`;
      },
      statusLabel: (status) => {
        const labels = {
          pending: "Pendiente",
          confirmed: "Confirmada",
          cancelled: "Cancelada",
        };
        return labels[status] ?? status;
      },
    },
  })
);
app.set("view engine", "handlebars");
app.set("views", path.join(__dirname, "views"));

// Archivos estáticos (CSS y cliente Socket.io)
app.use(express.static(path.join(__dirname, "public")));

// Middlewares para interpretar el body de las peticiones
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ruta de bienvenida de la API
app.get("/", (req, res) => {
  res.status(200).json({
    status: "success",
    message: "API del Sistema Backend de Turnos y Reservas (MongoDB + Handlebars + Socket.io)",
    resources: ["/api/services", "/api/bookings", "/api/messages"],
    views: ["/views/services", "/views/availability", "/views/bookings"],
  });
});

// Routers de la API REST
app.use("/api/services", servicesRouter);
app.use("/api/bookings", bookingsRouter);
app.use("/api/messages", messagesRouter);

// Router de vistas server-side (Handlebars)
app.use("/views", viewsRouter);

// Rutas inexistentes
app.use((req, res) => {
  res.status(404).json({ status: "error", error: `Ruta ${req.method} ${req.originalUrl} no encontrada` });
});

// Manejador global de errores (JSON mal formado y errores inesperados)
app.use((error, req, res, next) => {
  if (error.type === "entity.parse.failed") {
    return res.status(400).json({ status: "error", error: "El body no es un JSON válido" });
  }
  console.error(error);
  return res.status(500).json({ status: "error", error: "Error interno del servidor" });
});

export default app;
