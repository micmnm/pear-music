import { Router } from "express";
import { readLibrary, writeLibrary } from "./library.js";
import { fetchMetadata } from "./apple.js";

export function createRoutes(libraryPath: string): Router {
  const router = Router();

  router.get("/library", async (_req, res) => {
    const library = await readLibrary(libraryPath);
    res.json(library);
  });

  router.post("/library", async (req, res) => {
    const { url } = req.body;
    if (!url || typeof url !== "string") {
      res.status(400).json({ error: "Missing url" });
      return;
    }

    const item = await fetchMetadata(url);
    if (!item) {
      res.status(400).json({ error: "Invalid Apple Music URL or failed to fetch metadata" });
      return;
    }

    const library = await readLibrary(libraryPath);
    const exists = library.items.some((i) => i.id === item.id);
    if (exists) {
      res.status(409).json({ error: "Item already exists" });
      return;
    }

    library.items.push(item);
    await writeLibrary(libraryPath, library);
    res.status(201).json(item);
  });

  router.delete("/library/:id", async (req, res) => {
    const library = await readLibrary(libraryPath);
    const index = library.items.findIndex((i) => i.id === req.params.id);
    if (index === -1) {
      res.status(404).json({ error: "Item not found" });
      return;
    }

    library.items.splice(index, 1);
    await writeLibrary(libraryPath, library);
    res.json({ ok: true });
  });

  router.get("/shuffle", async (_req, res) => {
    const library = await readLibrary(libraryPath);
    if (library.items.length === 0) {
      res.status(404).json({ error: "Library is empty" });
      return;
    }

    const index = Math.floor(Math.random() * library.items.length);
    res.json(library.items[index]);
  });

  return router;
}
