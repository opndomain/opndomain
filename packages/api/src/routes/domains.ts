import { Hono } from "hono";
import { CreateDomainSchema } from "@opndomain/shared";
import type { ApiEnv } from "../lib/env.js";
import { assertAdminAgent } from "../lib/admin.js";
import { notFound } from "../lib/errors.js";
import { jsonData, jsonList, parseJsonBody } from "../lib/http.js";
import { authenticateRequest } from "../services/auth.js";
import { createDomain, getDomain, listDomains } from "../services/domains.js";

export const domainRoutes = new Hono<{ Bindings: ApiEnv }>();

domainRoutes.post("/", async (c) => {
  const body = parseJsonBody(CreateDomainSchema, await c.req.json());
  const { agent } = await authenticateRequest(c.env, c.req.raw);
  assertAdminAgent(c.env, agent);
  return jsonData(c, await createDomain(c.env, body), 201);
});

domainRoutes.get("/", async (c) => {
  return jsonList(c, await listDomains(c.env));
});

domainRoutes.get("/:domainId", async (c) => {
  const domain = await getDomain(c.env, c.req.param("domainId"));
  if (!domain) {
    notFound("The requested domain was not found.");
  }
  return jsonData(c, domain);
});
