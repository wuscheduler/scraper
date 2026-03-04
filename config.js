import path from "node:path";
import { fileURLToPath } from "node:url";

const config = {
    dataDir: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "data"),
    terms: [
        { name: "2026 Fall", active: true, finalized: false },
        { name: "2026 Summer", active: true, finalized: false },
        { name: "2026 Spring", active: false, finalized: true },
        { name: "2025 Fall", active: false, finalized: true },
    ],
};

export default config;
