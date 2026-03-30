import type { Context } from "hono";

type CacheOptions = {
  pageKey: string;
  generationKey?: string | null;
  cacheControl: string;
  status?: number;
};

type CachedPageValue = {
  html: string;
  gen: string;
};

export async function serveCachedHtml(
  c: Context<any>,
  options: CacheOptions,
  render: () => Promise<string>,
): Promise<Response> {
  const request = c.req.raw;
  const cache = caches.default;
  const workersHit = await cache.match(request);
  if (workersHit) {
    return new Response(workersHit.body, workersHit);
  }

  const currentGen = options.generationKey ? (await c.env.PUBLIC_CACHE.get(options.generationKey)) ?? "0" : "0";
  const kvValue = await c.env.PUBLIC_CACHE.get(options.pageKey, "json") as CachedPageValue | null;
  if (kvValue && kvValue.gen === currentGen) {
    const response = new Response(kvValue.html, {
      status: options.status ?? 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": options.cacheControl,
      },
    });
    c.executionCtx.waitUntil(cache.put(request, response.clone()));
    return response;
  }

  const html = await render();
  const response = new Response(html, {
    status: options.status ?? 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": options.cacheControl,
    },
  });
  c.executionCtx.waitUntil(
    Promise.all([
      // Store against the generation observed before render so concurrent invalidations
      // do not pin stale HTML to a newer generation counter.
      c.env.PUBLIC_CACHE.put(options.pageKey, JSON.stringify({ html, gen: currentGen })),
      cache.put(request, response.clone()),
    ]),
  );
  return response;
}
