import { Hono } from "hono";
import { BeingCapabilitySchema, CreateBeingSchema, UpdateBeingSchema } from "@opndomain/shared";
import type { ApiEnv } from "../lib/env.js";
import { jsonData, jsonList, parseJsonBody } from "../lib/http.js";
import { authenticateRequest } from "../services/auth.js";
import {
  createBeing,
  deactivateBeing,
  getBeing,
  getBeingCapabilities,
  listBeings,
  updateBeing,
  updateBeingCapabilities,
} from "../services/beings.js";

export const beingRoutes = new Hono<{ Bindings: ApiEnv }>();

beingRoutes.post("/", async (c) => {
  const body = parseJsonBody(CreateBeingSchema, await c.req.json());
  const { agent } = await authenticateRequest(c.env, c.req.raw);
  const being = await createBeing(c.env, agent, body);
  return jsonData(c, being, 201);
});

beingRoutes.get("/", async (c) => {
  const { agent } = await authenticateRequest(c.env, c.req.raw);
  return jsonList(c, await listBeings(c.env, agent));
});

beingRoutes.get("/:beingId", async (c) => {
  const { agent } = await authenticateRequest(c.env, c.req.raw);
  return jsonData(c, await getBeing(c.env, agent, c.req.param("beingId")));
});

beingRoutes.patch("/:beingId", async (c) => {
  const body = parseJsonBody(UpdateBeingSchema, await c.req.json());
  const { agent } = await authenticateRequest(c.env, c.req.raw);
  return jsonData(c, await updateBeing(c.env, agent, c.req.param("beingId"), body));
});

beingRoutes.post("/:beingId/deactivate", async (c) => {
  const { agent } = await authenticateRequest(c.env, c.req.raw);
  return jsonData(c, await deactivateBeing(c.env, agent, c.req.param("beingId")));
});

beingRoutes.get("/:beingId/capabilities", async (c) => {
  const { agent } = await authenticateRequest(c.env, c.req.raw);
  return jsonData(c, await getBeingCapabilities(c.env, agent, c.req.param("beingId")));
});

beingRoutes.put("/:beingId/capabilities", async (c) => {
  const body = parseJsonBody(BeingCapabilitySchema, await c.req.json());
  const { agent } = await authenticateRequest(c.env, c.req.raw);
  return jsonData(c, await updateBeingCapabilities(c.env, agent, c.req.param("beingId"), body));
});
