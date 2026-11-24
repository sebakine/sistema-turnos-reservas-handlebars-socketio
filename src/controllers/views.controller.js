import servicesService from "../services/services.service.js";
import bookingsService from "../services/bookings.service.js";

/**
 * Controller de vistas Handlebars: consulta exclusivamente la capa de services
 * (controller -> service -> repository -> DAO -> model) y renderiza las plantillas.
 * No contiene lógica de negocio ni accede directamente a MongoDB.
 */

/** GET /views/services -> listado de servicios desde MongoDB con actualización en tiempo real */
export const renderServicesView = async (req, res, next) => {
  try {
    const services = await servicesService.getServices();
    return res.status(200).render("services", {
      title: "Servicios | Sistema de Turnos y Reservas",
      activePage: "services",
      services,
      totalCount: services.length,
    });
  } catch (error) {
    return next(error);
  }
};

/** GET /views/availability -> disponibilidad de servicios y turnos agendados desde MongoDB */
export const renderAvailabilityView = async (req, res, next) => {
  try {
    const [services, bookings] = await Promise.all([
      servicesService.getServices(),
      bookingsService.getBookings({ populate: true }),
    ]);

    const availableServices = services.filter((s) => s.available);
    const unavailableServices = services.filter((s) => !s.available);

    return res.status(200).render("availability", {
      title: "Disponibilidad y Turnos | Sistema de Turnos y Reservas",
      activePage: "availability",
      services,
      availableServices,
      unavailableServices,
      availableCount: availableServices.length,
      unavailableCount: unavailableServices.length,
      bookings,
      bookingsCount: bookings.length,
    });
  } catch (error) {
    return next(error);
  }
};

/** GET /views/bookings -> listado de reservas reales desde MongoDB con gestión en tiempo real */
export const renderBookingsView = async (req, res, next) => {
  try {
    const [bookings, services] = await Promise.all([
      bookingsService.getBookings({ populate: true }),
      servicesService.getServices(),
    ]);

    return res.status(200).render("bookings", {
      title: "Reservas | Sistema de Turnos y Reservas",
      activePage: "bookings",
      bookings,
      bookingsCount: bookings.length,
      services,
    });
  } catch (error) {
    return next(error);
  }
};
