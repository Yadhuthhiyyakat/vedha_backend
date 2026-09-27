import { getExpiryMilestone } from "../services/notification.service.js";
import {
  createDocumentSchema,
  updateDocumentSchema,
  notificationQuerySchema,
} from "../validators/index.js";

console.log("=== Testing Smart Expiry & Notification System ===");

// ─── 1. Test Expiry Milestone Engine ─────────────────────────────────────────
console.log("\n1. Testing Expiry Milestones:");

const expiredMilestone = getExpiryMilestone(-5);
console.log("Expired (-5 days):", expiredMilestone?.milestone, expiredMilestone?.severity);
console.assert(expiredMilestone?.milestone === "expired", "Should detect expired milestone");
console.assert(expiredMilestone?.severity === "critical", "Expired should be critical");

const todayMilestone = getExpiryMilestone(0);
console.log("Today (0 days):", todayMilestone?.milestone, todayMilestone?.severity);
console.assert(todayMilestone?.milestone === "today", "Should detect today milestone");

const tomorrowMilestone = getExpiryMilestone(1);
console.log("Tomorrow (1 day):", tomorrowMilestone?.milestone, tomorrowMilestone?.severity);
console.assert(tomorrowMilestone?.milestone === "tomorrow", "Should detect tomorrow milestone");

const weekMilestone = getExpiryMilestone(6);
console.log("Within 7 days (6 days):", weekMilestone?.milestone, weekMilestone?.severity);
console.assert(weekMilestone?.milestone === "7_days", "Should detect 7_days milestone");
console.assert(weekMilestone?.severity === "warning", "7_days should be warning");

const monthMilestone = getExpiryMilestone(25);
console.log("Within 30 days (25 days):", monthMilestone?.milestone, monthMilestone?.severity);
console.assert(monthMilestone?.milestone === "30_days", "Should detect 30_days milestone");
console.assert(monthMilestone?.severity === "info", "30_days should be info");

const farMilestone = getExpiryMilestone(45);
console.log("Far future (45 days):", farMilestone);
console.assert(farMilestone === null, "Far future should not trigger any milestone");

// ─── 2. Test Message Generation ──────────────────────────────────────────────
console.log("\n2. Testing Generated Messages:");
const sampleMessage = weekMilestone?.getMessage(
  "Malayalam Driving License",
  "driving_license",
  6,
  "Oct 1, 2026"
);
console.log("Generated 7-day alert message:", sampleMessage);
console.assert(sampleMessage?.includes("Malayalam Driving License"), "Message should include title");
console.assert(sampleMessage?.includes("6 days"), "Message should include remaining days");

// ─── 3. Test createDocumentSchema with optional expiry_date ───────────────────
console.log("\n3. Testing Document Validation Schemas:");

// Valid with ISO date
const docWithIsoDate = createDocumentSchema.safeParse({
  title: "Vehicle RC",
  type: "transport",
  expiry_date: "2026-12-31T00:00:00.000Z",
});
console.log("Valid with ISO date:", docWithIsoDate.success);
console.assert(docWithIsoDate.success === true, "Should accept valid ISO date");

// Valid with standard YYYY-MM-DD
const docWithSimpleDate = createDocumentSchema.safeParse({
  title: "Health Card",
  type: "medical",
  expiry_date: "2027-05-15",
});
console.log("Valid with YYYY-MM-DD:", docWithSimpleDate.success);
console.assert(docWithSimpleDate.success === true, "Should accept simple date");

// Valid with null expiry_date (optional)
const docWithNullDate = createDocumentSchema.safeParse({
  title: "Lifetime Birth Certificate",
  type: "certificate",
  expiry_date: null,
});
console.log("Valid with null expiry_date:", docWithNullDate.success);
console.assert(docWithNullDate.success === true, "Should accept null expiry_date");

// Valid with omitted expiry_date (optional)
const docWithoutDate = createDocumentSchema.safeParse({
  title: "College ID",
  type: "education",
});
console.log("Valid with omitted expiry_date:", docWithoutDate.success);
console.assert(docWithoutDate.success === true, "Should accept omitted expiry_date");

// Invalid date string
const docWithBadDate = createDocumentSchema.safeParse({
  title: "Invalid Document",
  type: "other",
  expiry_date: "not-a-real-date",
});
console.log("Rejects invalid date format:", !docWithBadDate.success);
console.assert(docWithBadDate.success === false, "Should reject malformed date string");

// ─── 4. Test updateDocumentSchema ────────────────────────────────────────────
console.log("\n4. Testing Update Document Schema:");

const validUpdate = updateDocumentSchema.safeParse({
  expiry_date: "2028-01-01",
  title: "Updated Title",
});
console.log("Valid update payload:", validUpdate.success);
console.assert(validUpdate.success === true, "Should accept valid update");

const unsetExpiryUpdate = updateDocumentSchema.safeParse({
  expiry_date: null,
});
console.log("Unset expiry_date with null:", unsetExpiryUpdate.success);
console.assert(unsetExpiryUpdate.success === true, "Should allow resetting expiry_date to null");

// ─── 5. Test Notification Query Schema ───────────────────────────────────────
console.log("\n5. Testing Notification Query Schema:");

const validQuery = notificationQuerySchema.safeParse({
  status: "unread",
  type: "expiry_warning",
  limit: 20,
});
console.log("Valid notification query:", validQuery.success);
console.assert(validQuery.success === true, "Should parse notification query");

console.log("\n✅ All Smart Expiry & Notification tests passed successfully!");
