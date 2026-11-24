import bookingsService from "../services/bookings.service.js";
import { toErrorResponse } from "../utils/errors.js";
import { emitRealtimeEvent } from "../utils/realtime.js";

/**
 * Controller de bookings: lee la request (req.params, req.query, req.body),
 * llama al service, emite eventos en tiempo real ante cambios reales y responde JSON.
 */

/** Responde un error con el código HTTP que corresponde. */
const sendError = (res, error) => {
  const { statusCode, body } = toErrorResponse(error);
  return res.status(statusCode).json(body);
};

/** GET /api/bookings -> lista todas las reservas (opcional ?populate=true) */
export const getBookings = async (req, res) => {
  try {
    const { populate } = req.query;
    const bookings = await bookingsService.getBookings({ populate });
    return res.status(200).json({ status: "success", count: bookings.length, payload: bookings });
  } catch (error) {
    return sendError(res, error);
  }
};

/** POST /api/bookings -> crea una reserva (services puede iniciar vacío) y notifica en tiempo real */
export const createBooking = async (req, res) => {
  try {
    const newBooking = await bookingsService.createBooking(req.body);
    const populatedBooking = await bookingsService.getBookingById(newBooking._id, { populate: true });
    emitRealtimeEvent("booking:created", populatedBooking);
    return res.status(201).json({ status: "success", message: "Reserva creada", payload: newBooking });
  } catch (error) {
    return sendError(res, error);
  }
};

/** GET /api/bookings/:bid -> una reserva por id (opcional ?populate=true) */
export const getBookingById = async (req, res) => {
  try {
    const { populate } = req.query;
    const booking = await bookingsService.getBookingById(req.params.bid, { populate });
    return res.status(200).json({ status: "success", payload: booking });
  } catch (error) {
    return sendError(res, error);
  }
};

/** POST /api/bookings/:bid/services/:sid -> agrega un servicio a una reserva existente y notifica */
export const addServiceToBooking = async (req, res) => {
  try {
    const { bid, sid } = req.params;
    const booking = await bookingsService.addServiceToBooking(bid, sid);
    const populatedBooking = await bookingsService.getBookingById(booking._id, { populate: true });
    emitRealtimeEvent("booking:updated", populatedBooking);
    return res.status(200).json({ status: "success", message: "Servicio agregado a la reserva", payload: booking });
  } catch (error) {
    return sendError(res, error);
  }
};
