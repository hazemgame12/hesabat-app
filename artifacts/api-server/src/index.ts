import "./lib/load-env";
import app from "./app";
import { logger } from "./lib/logger";
import { seedArticles, seedServices, seedPackages, seedSettings, fixWordPressImageUrls } from "./seed";
import { startScheduler } from "./lib/scheduler";
import { ensurePayrollSchema } from "./lib/ensure-schema";

const rawPort = process.env["PORT"] ?? "3000";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  console.error(`Invalid PORT value: "${rawPort}"`);
  process.exit(1);
}

console.log(`[startup] Booting server on port ${port}...`);

const host = "0.0.0.0";

ensurePayrollSchema()
  .then(() => console.log("[startup] ✓ Payroll schema ensured"))
  .catch((e) => console.error("[startup] ensurePayrollSchema error:", e));

app.listen(port, host, () => {
  console.log(`[startup] ✓ Server listening on ${host}:${port}`);
  logger.info({ port, host }, "Server listening");
  Promise.all([
    seedArticles(),
    seedServices(),
    seedPackages(),
    seedSettings(),
    fixWordPressImageUrls(),
  ])
    .then(() => console.log("[startup] ✓ Seed completed"))
    .catch((e) => {
      console.error("[startup] Seed error:", e);
      logger.error({ e }, "Seed error");
    });
  startScheduler();
});

process.on("uncaughtException", (err) => {
  console.error("[fatal] uncaughtException:", err);
});
process.on("unhandledRejection", (err) => {
  console.error("[fatal] unhandledRejection:", err);
});
