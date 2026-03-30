import fs from "node:fs/promises";
import { Library } from "../shared/types.js";

export async function readLibrary(filePath: string): Promise<Library> {
  try {
    const data = await fs.readFile(filePath, "utf-8");
    return JSON.parse(data) as Library;
  } catch {
    const empty: Library = { items: [] };
    await writeLibrary(filePath, empty);
    return empty;
  }
}

export async function writeLibrary(
  filePath: string,
  library: Library
): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(library, null, 2));
}
