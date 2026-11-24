(() => {
  const socket = io();
  const page = document.body?.dataset?.page || "";

  const statusBadge = document.getElementById("socket-status");
  const toastEl = document.getElementById("realtime-toast");
  let toastTimer = null;

  const STATUS_LABELS = {
    pending: "Pendiente",
    confirmed: "Confirmada",
    cancelled: "Cancelada",
  };

  /** Escapa texto dinámico antes de insertarlo en HTML para evitar XSS. */
  const escapeHtml = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");

  const formatPrice = (price) => {
    const numeric = Number(price);
    if (!Number.isFinite(numeric)) return "$0";
    return `$${numeric.toLocaleString("es-CL")}`;
  };

  const showToast = (message) => {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.hidden = true;
    }, 3500);
  };

  const flashElement = (el) => {
    if (!el) return;
    el.classList.remove("realtime-flash");
    void el.offsetWidth;
    el.classList.add("realtime-flash");
    setTimeout(() => el.classList.remove("realtime-flash"), 1400);
  };

  // --- Estado de conexión Socket.io ---
  socket.on("connect", () => {
    if (!statusBadge) return;
    statusBadge.textContent = "En tiempo real";
    statusBadge.className = "socket-badge socket-connected";
  });

  socket.on("disconnect", () => {
    if (!statusBadge) return;
    statusBadge.textContent = "Desconectado";
    statusBadge.className = "socket-badge socket-disconnected";
  });

  // --- Renderizado dinámico de tarjetas de servicios ---
  const buildServiceCardHTML = (service) => {
    const available = Boolean(service.available);
    const id = escapeHtml(service._id);
    return `
      <div class="card-top">
        <div>
          <h3 class="card-title">${escapeHtml(service.name)}</h3>
          <span class="category-tag">${escapeHtml(service.category)}</span>
        </div>
        <span class="badge ${available ? "badge-ok" : "badge-off"}" data-role="availability-badge">
          ${available ? "Disponible" : "No disponible"}
        </span>
      </div>
      <p class="card-desc">${escapeHtml(service.description)}</p>
      <dl class="meta-grid">
        <div>
          <dt>Duración</dt>
          <dd>${escapeHtml(service.duration)} min</dd>
        </div>
        <div>
          <dt>Precio</dt>
          <dd>${escapeHtml(formatPrice(service.price))}</dd>
        </div>
      </dl>
      <div class="card-actions">
        <button
          type="button"
          class="btn btn-secondary js-toggle-availability"
          data-service-id="${id}"
          data-available="${available}"
        >
          ${available ? "Marcar no disponible" : "Marcar disponible"}
        </button>
        <button type="button" class="btn btn-danger js-delete-service" data-service-id="${id}">
          Eliminar
        </button>
      </div>
    `;
  };

  const buildAvailabilityServiceCardHTML = (service) => {
    const available = Boolean(service.available);
    const id = escapeHtml(service._id);
    return `
      <div class="card-top">
        <div>
          <h3 class="card-title">${escapeHtml(service.name)}</h3>
          <p class="card-meta">${escapeHtml(service.category)} · ${escapeHtml(service.duration)} min · ${escapeHtml(formatPrice(service.price))}</p>
        </div>
        <span class="badge ${available ? "badge-ok" : "badge-off"}" data-role="availability-badge">
          ${available ? "Disponible" : "No disponible"}
        </span>
      </div>
      <div class="card-actions">
        <button
          type="button"
          class="btn btn-secondary js-toggle-availability"
          data-service-id="${id}"
          data-available="${available}"
        >
          ${available ? "Pausar disponibilidad" : "Habilitar servicio"}
        </button>
      </div>
    `;
  };

  const renderBookingServicesListHTML = (services) => {
    if (!Array.isArray(services) || services.length === 0) {
      return '<li class="muted">Sin servicios asignados aún</li>';
    }
    return services
      .map((item) => {
        const label =
          item.service && typeof item.service === "object" && item.service.name
            ? item.service.name
            : `Servicio ${item.service}`;
        return `<li>${escapeHtml(label)} <span class="qty-chip">x${escapeHtml(item.quantity)}</span></li>`;
      })
      .join("");
  };

  const getServiceOptionsHTML = () => {
    const baseSelect = document.getElementById("booking-service-select");
    if (!baseSelect) return "";
    return [...baseSelect.options]
      .filter((opt) => opt.value)
      .map((opt) => `<option value="${escapeHtml(opt.value)}">${escapeHtml(opt.textContent)}</option>`)
      .join("");
  };

  const buildBookingCardHTML = (booking) => {
    const status = booking.status || "pending";
    const statusText = STATUS_LABELS[status] || status;
    const id = escapeHtml(booking._id);
    const optionsHTML = getServiceOptionsHTML();
    const addFormHTML =
      status !== "cancelled" && optionsHTML
        ? `
          <form class="inline-add-service js-add-service-form" data-booking-id="${id}">
            <select name="serviceId" required aria-label="Seleccionar servicio para agregar">
              ${optionsHTML}
            </select>
            <button type="submit" class="btn btn-secondary">Agregar servicio</button>
          </form>
        `
        : "";

    return `
      <div class="card-top">
        <div>
          <h3 class="card-title">${escapeHtml(booking.clientName)}</h3>
          <p class="card-meta">${escapeHtml(booking.clientEmail)} · ${escapeHtml(booking.date)} a las ${escapeHtml(booking.time)} hs</p>
        </div>
        <span class="badge badge-status-${escapeHtml(status)}">${escapeHtml(statusText)}</span>
      </div>
      <div class="booking-services-block">
        <h4>Servicios incluidos</h4>
        <ul class="mini-service-list" data-role="booking-services">
          ${renderBookingServicesListHTML(booking.services)}
        </ul>
      </div>
      ${addFormHTML}
    `;
  };

  const buildAvailabilityBookingCardHTML = (booking) => {
    const status = booking.status || "pending";
    const statusText = STATUS_LABELS[status] || status;
    return `
      <div class="card-top">
        <div>
          <h3 class="card-title">${escapeHtml(booking.date)} · ${escapeHtml(booking.time)} hs</h3>
          <p class="card-meta">${escapeHtml(booking.clientName)} (${escapeHtml(booking.clientEmail)})</p>
        </div>
        <span class="badge badge-status-${escapeHtml(status)}">${escapeHtml(statusText)}</span>
      </div>
      <ul class="mini-service-list">
        ${renderBookingServicesListHTML(booking.services)}
      </ul>
    `;
  };

  const syncServiceCounters = () => {
    const totalEl = document.getElementById("services-total-count");
    const servicesList = document.getElementById("services-list");
    if (totalEl && servicesList) {
      totalEl.textContent = String(servicesList.querySelectorAll("[data-service-id]").length);
    }

    const availList = document.getElementById("availability-services-list");
    const availEl = document.getElementById("available-count");
    const unavailEl = document.getElementById("unavailable-count");
    if (availList && availEl && unavailEl) {
      const cards = [...availList.querySelectorAll("[data-service-id]")];
      const available = cards.filter((c) => c.dataset.available === "true").length;
      availEl.textContent = String(available);
      unavailEl.textContent = String(cards.length - available);
    }
  };

  const syncBookingCounters = () => {
    const totalEl = document.getElementById("bookings-total-count");
    const bookingsList = document.getElementById("bookings-list");
    if (totalEl && bookingsList) {
      totalEl.textContent = String(bookingsList.querySelectorAll("[data-booking-id]").length);
    }

    const availBookingsEl = document.getElementById("availability-bookings-count");
    const availBookingsList = document.getElementById("availability-bookings-list");
    if (availBookingsEl && availBookingsList) {
      availBookingsEl.textContent = String(availBookingsList.querySelectorAll("[data-booking-id]").length);
    }
  };

  const syncBookingServiceSelect = (service, action) => {
    const selects = document.querySelectorAll('#booking-service-select, .js-add-service-form select[name="serviceId"]');
    selects.forEach((select) => {
      const existing = select.querySelector(`option[value="${CSS.escape(String(service._id))}"]`);
      if (action === "deleted") {
        existing?.remove();
        return;
      }
      const label =
        select.id === "booking-service-select"
          ? `${service.name} (${service.duration} min - ${formatPrice(service.price)})`
          : service.name;
      if (existing) {
        existing.textContent = label;
      } else {
        const option = document.createElement("option");
        option.value = String(service._id);
        option.textContent = label;
        select.appendChild(option);
      }
    });
  };

  // --- Escucha de eventos en tiempo real desde el servidor ---
  socket.on("service:created", (service) => {
    const servicesList = document.getElementById("services-list");
    if (servicesList) {
      document.getElementById("services-empty")?.remove();
      if (!servicesList.querySelector(`[data-service-id="${CSS.escape(String(service._id))}"]`)) {
        const card = document.createElement("article");
        card.className = "card";
        card.dataset.serviceId = String(service._id);
        card.innerHTML = buildServiceCardHTML(service);
        servicesList.prepend(card);
        flashElement(card);
      }
    }

    const availList = document.getElementById("availability-services-list");
    if (availList) {
      document.getElementById("availability-services-empty")?.remove();
      if (!availList.querySelector(`[data-service-id="${CSS.escape(String(service._id))}"]`)) {
        const card = document.createElement("article");
        card.className = "card compact-card";
        card.dataset.serviceId = String(service._id);
        card.dataset.available = String(Boolean(service.available));
        card.innerHTML = buildAvailabilityServiceCardHTML(service);
        availList.prepend(card);
        flashElement(card);
      }
    }

    syncBookingServiceSelect(service, "created");
    syncServiceCounters();
    showToast(`Nuevo servicio agregado: ${service.name}`);
  });

  socket.on("service:updated", (service) => {
    const selector = `[data-service-id="${CSS.escape(String(service._id))}"]`;

    const serviceCard = document.querySelector(`#services-list ${selector}`);
    if (serviceCard) {
      serviceCard.innerHTML = buildServiceCardHTML(service);
      flashElement(serviceCard);
    }

    const availCard = document.querySelector(`#availability-services-list ${selector}`);
    if (availCard) {
      availCard.dataset.available = String(Boolean(service.available));
      availCard.innerHTML = buildAvailabilityServiceCardHTML(service);
      flashElement(availCard);
    }

    syncBookingServiceSelect(service, "updated");
    syncServiceCounters();
    const estado = service.available ? "Disponible" : "No disponible";
    showToast(`Servicio actualizado: ${service.name} (${estado})`);
  });

  socket.on("service:deleted", ({ _id, name }) => {
    const selector = `[data-service-id="${CSS.escape(String(_id))}"]`;
    document.querySelectorAll(selector).forEach((el) => {
      if (el.tagName === "ARTICLE") el.remove();
    });

    const servicesList = document.getElementById("services-list");
    if (servicesList && servicesList.querySelectorAll("[data-service-id]").length === 0) {
      servicesList.innerHTML =
        '<p id="services-empty" class="empty-state">No hay servicios cargados todavía en MongoDB. Crea el primero desde el formulario.</p>';
    }

    syncBookingServiceSelect({ _id }, "deleted");
    syncServiceCounters();
    showToast(`Servicio eliminado: ${name || _id}`);
  });

  socket.on("booking:created", (booking) => {
    const bookingsList = document.getElementById("bookings-list");
    if (bookingsList) {
      document.getElementById("bookings-empty")?.remove();
      if (!bookingsList.querySelector(`[data-booking-id="${CSS.escape(String(booking._id))}"]`)) {
        const card = document.createElement("article");
        card.className = "card";
        card.dataset.bookingId = String(booking._id);
        card.innerHTML = buildBookingCardHTML(booking);
        bookingsList.prepend(card);
        flashElement(card);
      }
    }

    const availBookingsList = document.getElementById("availability-bookings-list");
    if (availBookingsList) {
      document.getElementById("availability-bookings-empty")?.remove();
      if (!availBookingsList.querySelector(`[data-booking-id="${CSS.escape(String(booking._id))}"]`)) {
        const card = document.createElement("article");
        card.className = "card compact-card";
        card.dataset.bookingId = String(booking._id);
        card.innerHTML = buildAvailabilityBookingCardHTML(booking);
        availBookingsList.prepend(card);
        flashElement(card);
      }
    }

    syncBookingCounters();
    showToast(`Nueva reserva agendada: ${booking.clientName} (${booking.date} ${booking.time})`);
  });

  socket.on("booking:updated", (booking) => {
    const selector = `[data-booking-id="${CSS.escape(String(booking._id))}"]`;

    const bookingCard = document.querySelector(`#bookings-list ${selector}`);
    if (bookingCard) {
      bookingCard.innerHTML = buildBookingCardHTML(booking);
      flashElement(bookingCard);
    }

    const availCard = document.querySelector(`#availability-bookings-list ${selector}`);
    if (availCard) {
      availCard.innerHTML = buildAvailabilityBookingCardHTML(booking);
      flashElement(availCard);
    }

    showToast(`Reserva actualizada: ${booking.clientName}`);
  });

  // --- Interacciones del usuario contra la API REST (persiste en MongoDB y dispara Socket.io) ---
  const showFormFeedback = (el, text, isError = false) => {
    if (!el) return;
    el.textContent = text;
    el.className = `form-feedback ${isError ? "error" : "success"}`;
    el.hidden = false;
  };

  const createServiceForm = document.getElementById("create-service-form");
  if (createServiceForm) {
    createServiceForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const feedback = document.getElementById("service-form-feedback");
      const formData = new FormData(createServiceForm);
      const payload = {
        name: String(formData.get("name") || "").trim(),
        description: String(formData.get("description") || "").trim(),
        duration: Number.parseInt(String(formData.get("duration")), 10),
        price: Number(formData.get("price")),
        category: String(formData.get("category") || "").trim(),
        available: formData.get("available") === "true",
      };

      try {
        const response = await fetch("/api/services", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (!response.ok) {
          const detail = Array.isArray(data.details) ? ` (${data.details.join("; ")})` : "";
          showFormFeedback(feedback, `${data.error || "Error al crear el servicio"}${detail}`, true);
          return;
        }
        createServiceForm.reset();
        showFormFeedback(feedback, "Servicio creado y sincronizado en tiempo real.");
      } catch {
        showFormFeedback(feedback, "No se pudo conectar con el servidor.", true);
      }
    });
  }

  const createBookingForm = document.getElementById("create-booking-form");
  if (createBookingForm) {
    createBookingForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const feedback = document.getElementById("booking-form-feedback");
      const formData = new FormData(createBookingForm);
      const serviceId = String(formData.get("serviceId") || "").trim();
      const payload = {
        clientName: String(formData.get("clientName") || "").trim(),
        clientEmail: String(formData.get("clientEmail") || "").trim(),
        date: String(formData.get("date") || "").trim(),
        time: String(formData.get("time") || "").trim(),
        services: serviceId ? [{ service: serviceId, quantity: 1 }] : [],
      };

      try {
        const response = await fetch("/api/bookings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (!response.ok) {
          const detail = Array.isArray(data.details) ? ` (${data.details.join("; ")})` : "";
          showFormFeedback(feedback, `${data.error || "Error al crear la reserva"}${detail}`, true);
          return;
        }
        createBookingForm.reset();
        showFormFeedback(feedback, "Reserva creada y sincronizada en tiempo real.");
      } catch {
        showFormFeedback(feedback, "No se pudo conectar con el servidor.", true);
      }
    });
  }

  // Delegación de eventos para botones de disponibilidad, eliminación y agregado de servicio
  document.addEventListener("click", async (event) => {
    const toggleBtn = event.target.closest(".js-toggle-availability");
    if (toggleBtn) {
      const serviceId = toggleBtn.dataset.serviceId;
      const current = toggleBtn.dataset.available === "true";
      toggleBtn.disabled = true;
      try {
        const response = await fetch(`/api/services/${encodeURIComponent(serviceId)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ available: !current }),
        });
        if (!response.ok) {
          const data = await response.json();
          showToast(data.error || "No se pudo cambiar la disponibilidad");
        }
      } catch {
        showToast("Error de conexión al actualizar disponibilidad");
      } finally {
        toggleBtn.disabled = false;
      }
      return;
    }

    const deleteBtn = event.target.closest(".js-delete-service");
    if (deleteBtn) {
      const serviceId = deleteBtn.dataset.serviceId;
      deleteBtn.disabled = true;
      try {
        const response = await fetch(`/api/services/${encodeURIComponent(serviceId)}`, {
          method: "DELETE",
        });
        if (!response.ok) {
          const data = await response.json();
          showToast(data.error || "No se pudo eliminar el servicio");
        }
      } catch {
        showToast("Error de conexión al eliminar el servicio");
      } finally {
        deleteBtn.disabled = false;
      }
    }
  });

  document.addEventListener("submit", async (event) => {
    const addForm = event.target.closest(".js-add-service-form");
    if (!addForm) return;
    event.preventDefault();

    const bookingId = addForm.dataset.bookingId;
    const select = addForm.querySelector('select[name="serviceId"]');
    const serviceId = select?.value;
    if (!bookingId || !serviceId) return;

    const button = addForm.querySelector('button[type="submit"]');
    if (button) button.disabled = true;

    try {
      const response = await fetch(
        `/api/bookings/${encodeURIComponent(bookingId)}/services/${encodeURIComponent(serviceId)}`,
        { method: "POST" }
      );
      if (!response.ok) {
        const data = await response.json();
        showToast(data.error || "No se pudo agregar el servicio a la reserva");
      }
    } catch {
      showToast("Error de conexión al agregar el servicio");
    } finally {
      if (button) button.disabled = false;
    }
  });

  // Asegura consistencia inicial de contadores si la página se renderizó con datos
  if (page === "services" || page === "availability") syncServiceCounters();
  if (page === "bookings" || page === "availability") syncBookingCounters();
})();
