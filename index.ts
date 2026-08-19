import "./src/config/env.js"; // must be first — loads .env before anything else
import app from "./src/app.js";

const PORT = Number(process.env.PORT ?? 5000);

app.listen(PORT, () => {
  console.log(`✅  Veda API running at http://localhost:${PORT}`);
  console.log(`    ENV: ${process.env.NODE_ENV ?? "development"}`);
});