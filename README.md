# Sistema Backend de Turnos y Reservas — Vistas con Handlebars y Tiempo Real con Socket.io

Aplicación backend del **Sistema de Turnos y Reservas** construida con **Node.js, Express, MongoDB Atlas (Mongoose), Handlebars y Socket.io**, manteniendo la **API REST** y la **arquitectura en capas** (`routes → controllers → services → repositories → DAO → models`).

En esta entrega se suma una capa visual renderizada del lado del servidor con **Handlebars** (`/views/services`, `/views/availability` y `/views/bookings`) alimentada exclusivamente con datos reales de **MongoDB**, junto con comunicación en tiempo real mediante **Socket.io** que actualiza todas las ventanas conectadas sin recargar la página cuando ocurren acciones reales del sistema.

## Tecnologías

- Node.js 18 o superior
- Express 5
- MongoDB Atlas + Mongoose 8
- Express Handlebars (`express-handlebars`)
- Socket.io 4
- dotenv
- Módulos ES (`"type": "module"`)

---

## Arquitectura en capas + Vistas + Tiempo real

Tanto la **API REST** como las **vistas Handlebars** consumen las mismas capas de negocio y persistencia:

```
API REST:   routes → controllers ──┐
                                   ├──▶ services → repositories → DAO → Mongoose Models → MongoDB Atlas
Vistas SSR: views.router → views.controller ──┘

Tiempo real: controllers (tras persistir en MongoDB) → utils/realtime.js → Socket.io → public/js/socket.js
```

### Principios respetados

- **Sin datos hardcodeados en vistas:** `views.controller.js` consulta `servicesService` y `bookingsService` (nunca accede directamente a modelos ni duplica lógica de negocio).
- **Eventos de negocio reales en Socket.io:** no se emiten eventos genéricos al conectar; los eventos se disparan únicamente al crear, actualizar o eliminar servicios y al crear o modificar reservas en MongoDB.
- **API REST intacta:** todos los endpoints de `/api/services`, `/api/bookings` y `/api/messages` siguen funcionando con el mismo contrato.

---

## Estructura del proyecto

```
src/
  config/
    env.config.js               # Variables de entorno (PORT, MONGO_URI)
    db.config.js                # Conexión y cierre limpio de MongoDB Atlas
    socket.config.js            # Inicialización del servidor Socket.io
  models/
    service.model.js            # Esquema Mongoose de services
    booking.model.js            # Esquema Mongoose de bookings (services con ObjectId)
    message.model.js            # Esquema Mongoose de messages
  dao/
    services.dao.js             # Persistencia MongoDB de services
    bookings.dao.js             # Persistencia MongoDB de bookings
    messages.dao.js             # Persistencia MongoDB de messages
  repositories/
    services.repository.js      # Acceso a datos de services
    bookings.repository.js      # Acceso a datos de bookings
    messages.repository.js      # Acceso a datos de messages
  services/
    services.service.js         # Reglas de negocio de services
    bookings.service.js         # Reglas de negocio de bookings
    messages.service.js         # Reglas de negocio de messages
  controllers/
    services.controller.js      # API /api/services + emisión de eventos Socket.io
    bookings.controller.js      # API /api/bookings + emisión de eventos Socket.io
    messages.controller.js      # API /api/messages
    views.controller.js         # Renderizado Handlebars usando la capa de services
  routes/
    services.router.js          # Endpoints /api/services
    bookings.router.js          # Endpoints /api/bookings
    messages.router.js          # Endpoints /api/messages
    views.router.js             # Rutas de vistas /views/services, /views/availability y /views/bookings
  views/
    layouts/
      main.handlebars           # Layout base HTML, navegación, estado Socket.io y scripts
    services.handlebars         # Listado y gestión en tiempo real de servicios
    availability.handlebars     # Disponibilidad de servicios y turnos agendados en vivo
    bookings.handlebars         # Listado y creación de reservas en tiempo real
  public/
    css/
      styles.css                # Estilos limpios y responsivos para las vistas
    js/
      socket.js                 # Cliente Socket.io: escucha eventos y actualiza el DOM sin recargar
  scripts/
    seed.js                     # Carga inicial opcional de datos de ejemplo en MongoDB Atlas
  utils/
    errors.js                   # ValidationError (400), NotFoundError (404) y formato de error
    realtime.js                 # Bus desacoplado de emisión Socket.io
  app.js                        # Configuración de Express, Handlebars, estáticos y routers
  server.js                     # Conexión a MongoDB, servidor HTTP + Socket.io y apagado ordenado
tests/
  api.test.js                   # Pruebas integrales de API REST, Handlebars y Socket.io
package.json
.env.example
.gitignore
README.md
```

---

## Vistas Handlebars disponibles

| Ruta | Plantilla | Descripción |
|------|-----------|-------------|
| `GET /views/services` | `services.handlebars` | Muestra todos los servicios reales desde MongoDB (nombre, descripción, duración, precio, categoría y disponibilidad), formulario de alta, cambio de disponibilidad y eliminación sincronizados en tiempo real. |
| `GET /views/availability` | `availability.handlebars` | Muestra el estado de disponibilidad de cada servicio y los turnos agendados en MongoDB con contadores en vivo y actualización instantánea ante cambios. |
| `GET /views/bookings` | `bookings.handlebars` | Lista las reservas desde MongoDB con sus servicios referenciados por `ObjectId` (populados), formulario para crear reservas y acción rápida para agregar servicios incrementando `quantity`. |

---

## Eventos en tiempo real (Socket.io)

Cada acción persistida en MongoDB emite un evento a todos los navegadores conectados y actualiza el DOM automáticamente sin recargar la página (tanto si se dispara desde la vista como si se envía desde Postman o `curl`):

| Acción del sistema | Endpoint | Evento Socket.io | Efecto en las vistas |
|--------------------|----------|------------------|----------------------|
| Crear servicio | `POST /api/services` | `service:created` | Inserta el nuevo servicio en `/views/services` y `/views/availability` y actualiza contadores y selectores. |
| Actualizar servicio / disponibilidad | `PUT /api/services/:sid` | `service:updated` | Actualiza el badge de disponibilidad y datos del servicio en tiempo real. |
| Eliminar servicio | `DELETE /api/services/:sid` | `service:deleted` | Quita la tarjeta del servicio y actualiza contadores. |
| Crear reserva | `POST /api/bookings` | `booking:created` | Agrega la reserva en `/views/bookings` y la agenda en `/views/availability`. |
| Agregar servicio a una reserva | `POST /api/bookings/:bid/services/:sid` | `booking:updated` | Refleja el nuevo servicio o el incremento de `quantity` en la reserva. |

---

## Endpoints de la API REST (sin cambios en el contrato)

### Servicios (`/api/services`)

- `GET /api/services` *(filtros opcionales `?category=` y `?available=`)*
- `GET /api/services/:sid`
- `POST /api/services`
- `PUT /api/services/:sid`
- `DELETE /api/services/:sid`

### Reservas (`/api/bookings`)

- `GET /api/bookings` *(opcional `?populate=true`)*
- `POST /api/bookings`
- `GET /api/bookings/:bid` *(opcional `?populate=true`)*
- `POST /api/bookings/:bid/services/:sid`

### Mensajes (`/api/messages`)

- `GET /api/messages` *(opcional `?user=` y `?booking=`)*
- `GET /api/messages/:mid`
- `POST /api/messages`
- `DELETE /api/messages/:mid`

---

## Instalación y ejecución

1. Clonar el repositorio e ingresar a la carpeta:

   ```bash
   git clone https://github.com/sebakine/sistema-turnos-reservas-handlebars-socketio.git
   cd sistema-turnos-reservas-handlebars-socketio
   ```

2. Instalar las dependencias:

   ```bash
   npm install
   ```

3. Crear el archivo `.env` a partir de `.env.example` y configurar `MONGO_URI`:

   ```bash
   cp .env.example .env      # En Windows (PowerShell): Copy-Item .env.example .env
   ```

4. *(Opcional)* Poblar datos iniciales en MongoDB Atlas:

   ```bash
   npm run seed
   ```

5. Levantar el servidor:

   ```bash
   npm start       # modo normal
   npm run dev     # modo desarrollo con recarga automática
   ```

6. Abrir en el navegador:
   - `http://localhost:8080/views/services`
   - `http://localhost:8080/views/availability`
   - `http://localhost:8080/views/bookings`

   Si abres dos pestañas en paralelo (por ejemplo `/views/services` y `/views/availability`) y creas un servicio o cambias su disponibilidad, verás el cambio reflejado al instante en ambas pestañas sin recargar.

7. Ejecutar las pruebas automatizadas integrales (API REST + MongoDB + Handlebars + Socket.io):

   ```bash
   npm test
   ```

---

## Autor

Sebastian Felipe Muñoz Rivera
