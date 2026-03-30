import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRoutes } from "./routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const LIBRARY_PATH = path.resolve(__dirname, "../../data/library.json");

const app = express();
app.use(express.json());
app.use("/api", createRoutes(LIBRARY_PATH));

// Serve static frontend in production
const clientDist = path.resolve(__dirname, "../client");
app.use(express.static(clientDist));
app.get("*", (_req, res) => {
  res.sendFile(path.join(clientDist, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
