Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
      },
    });
  }

  try {
    const { action, ...params } = await req.json();

    if (action === "search") {
      const { query, storefront = "us" } = params;
      if (!query) {
        return Response.json({ error: "query required" }, { status: 400 });
      }

      const url = `https://itunes.apple.com/search?${new URLSearchParams({
        term: query,
        entity: "album",
        limit: "25",
        country: storefront,
      })}`;

      const res = await fetch(url);
      const data = await res.json();
      return Response.json(data);
    }

    if (action === "lookup") {
      const { collectionId, storefront = "us" } = params;
      if (!collectionId) {
        return Response.json({ error: "collectionId required" }, { status: 400 });
      }

      const url = `https://itunes.apple.com/lookup?${new URLSearchParams({
        id: collectionId,
        country: storefront,
      })}`;

      const res = await fetch(url);
      const data = await res.json();
      return Response.json(data);
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
});
