const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, ...params } = await req.json();

    if (action === "search") {
      const { query, storefront = "us" } = params;
      if (!query) {
        return jsonResponse({ error: "query required" }, 400);
      }

      const url = `https://itunes.apple.com/search?${new URLSearchParams({
        term: query,
        entity: "album",
        limit: "25",
        country: storefront,
      })}`;

      const res = await fetch(url);
      const data = await res.json();
      return jsonResponse(data);
    }

    if (action === "lookup") {
      const { collectionId, storefront = "us" } = params;
      if (!collectionId) {
        return jsonResponse({ error: "collectionId required" }, 400);
      }

      const url = `https://itunes.apple.com/lookup?${new URLSearchParams({
        id: collectionId,
        country: storefront,
      })}`;

      const res = await fetch(url);
      const data = await res.json();
      return jsonResponse(data);
    }

    return jsonResponse({ error: "Unknown action" }, 400);
  } catch (err) {
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Internal error" },
      500
    );
  }
});
