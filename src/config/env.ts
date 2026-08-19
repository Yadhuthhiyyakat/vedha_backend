import { config } from "dotenv";
import { resolve } from "path";

// Load .env from the project root
config({ path: resolve(process.cwd(), ".env") });
