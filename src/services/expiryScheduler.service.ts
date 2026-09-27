import { checkAndGenerateExpiryNotifications } from "./notification.service.js";

let schedulerInterval: NodeJS.Timeout | null = null;

/**
 * Default interval: Every 6 hours (in ms).
 * Can be overridden via env EXPIRY_CHECK_INTERVAL_HOURS.
 */
const INTERVAL_HOURS = Number(process.env.EXPIRY_CHECK_INTERVAL_HOURS ?? 6);
const INTERVAL_MS = INTERVAL_HOURS * 60 * 60 * 1000;

/**
 * Initializes periodic expiry check scheduler.
 * Runs one check immediately on startup (with small delay so DB is ready),
 * then repeats on the configured interval.
 */
export function startExpiryScheduler(): void {
  if (schedulerInterval) {
    console.log("[ExpiryScheduler] Scheduler already running.");
    return;
  }

  console.log(`[ExpiryScheduler] Initialized. Running every ${INTERVAL_HOURS} hour(s).`);

  // Run initial check 10 seconds after server startup
  setTimeout(async () => {
    try {
      console.log("[ExpiryScheduler] Running initial certificate expiry audit...");
      const result = await checkAndGenerateExpiryNotifications();
      console.log(
        `[ExpiryScheduler] Initial check completed: ${result.checked} docs checked, ${result.created} alerts created, ${result.skipped} throttled.`
      );
    } catch (err) {
      console.error("[ExpiryScheduler] Error during initial check:", err);
    }
  }, 10_000);

  // Set recurring interval
  schedulerInterval = setInterval(async () => {
    try {
      console.log("[ExpiryScheduler] Running scheduled certificate expiry check...");
      const result = await checkAndGenerateExpiryNotifications();
      console.log(
        `[ExpiryScheduler] Scheduled check completed: ${result.checked} docs checked, ${result.created} alerts created, ${result.skipped} throttled.`
      );
    } catch (err) {
      console.error("[ExpiryScheduler] Error during scheduled check:", err);
    }
  }, INTERVAL_MS);
}

/**
 * Stops the recurring scheduler (useful for tests or graceful shutdown).
 */
export function stopExpiryScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log("[ExpiryScheduler] Stopped.");
  }
}
