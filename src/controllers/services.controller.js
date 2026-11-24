import servicesService from "../services/services.service.js";
import { toErrorResponse } from "../utils/errors.js";
import { emitRealtimeEvent } from "../utils/realtime.js";

/**
 * Controller de services: lee la request (req.params, req.query, req.body),
 * llama al service, emite eventos en tiempo real ante cambios reales y responde JSON.
 */

/** Responde un error con el código HTTP que corresponde. */
const sendError = (res, error) => {
  const { statusCode, body } = toErrorResponse(error);
  return res.status(statusCode).json(body);
};

/** GET /api/services -> todos los servicios (filtros opcionales ?category= y ?available=) */
export const getServices = async (req, res) => {
  try {
    const { category, available } = req.query;
    const services = await servicesService.getServices({ category, available });
    return res.status(200).json({ status: "success", count: services.length, payload: services });
  } catch (error) {
    return sendError(res, error);
  }
};

/** GET /api/services/:sid -> un servicio por id */
export const getServiceById = async (req, res) => {
  try {
    const service = await servicesService.getServiceById(req.params.sid);
    return res.status(200).json({ status: "success", payload: service });
  } catch (error) {
    return sendError(res, error);
  }
};

/** POST /api/services -> crea un servicio y notifica en tiempo real */
export const createService = async (req, res) => {
  try {
    const newService = await servicesService.createService(req.body);
    emitRealtimeEvent("service:created", newService);
    return res.status(201).json({ status: "success", message: "Servicio creado", payload: newService });
  } catch (error) {
    return sendError(res, error);
  }
};

/** PUT /api/services/:sid -> actualiza un servicio (el _id no se modifica) y notifica en tiempo real */
export const updateService = async (req, res) => {
  try {
    const updated = await servicesService.updateService(req.params.sid, req.body);
    emitRealtimeEvent("service:updated", updated);
    return res.status(200).json({ status: "success", message: "Servicio actualizado", payload: updated });
  } catch (error) {
    return sendError(res, error);
  }
};

/** DELETE /api/services/:sid -> elimina un servicio y notifica en tiempo real */
export const deleteService = async (req, res) => {
  try {
    const deleted = await servicesService.deleteService(req.params.sid);
    emitRealtimeEvent("service:deleted", { _id: String(deleted._id), name: deleted.name });
    return res.status(200).json({ status: "success", message: "Servicio eliminado", payload: deleted });
  } catch (error) {
    return sendError(res, error);
  }
};
