import path from "node:path";
import { fileURLToPath } from "node:url";

const config = {
    dataDir: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "data"),
    terms: [
        { name: "2026 Fall", active: true },
        { name: "2026 Summer", active: true },
        { name: "2026 Spring", active: false },
        { name: "2025 Fall", active: false },
        { name: "2025 Spring", active: false },
    ],
};

export default config;
