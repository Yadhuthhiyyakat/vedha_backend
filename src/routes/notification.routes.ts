import { Router } from "express";
import {
  getMyNotifications,
  getUnreadCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  getExpiringSummary,
  triggerExpiryCheck,
} from "../controllers/notification.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { validate } from "../middleware/validate.middleware.js";
import { notificationQuerySchema } from "../validators/index.js";

const router = Router();

// All notification routes require authentication
router.use(requireAuth);

// GET    /api/notifications                  — list user notifications (?status=unread&type=...)
router.get("/", validate(notificationQuerySchema, "query"), getMyNotifications);

// GET    /api/notifications/unread-count     — get unread notifications count for badge
router.get("/unread-count", getUnreadCount);

// GET    /api/notifications/expiring-summary — get expiring certificate overview
router.get("/expiring-summary", getExpiringSummary);

// POST   /api/notifications/check-expiry     — trigger an on-demand expiry audit
router.post("/check-expiry", triggerExpiryCheck);

// PATCH  /api/notifications/read-all         — mark all notifications as read
router.patch("/read-all", markAllNotificationsAsRead);

// PATCH  /api/notifications/:id/read         — mark specific notification as read
router.patch("/:id/read", markNotificationAsRead);

// DELETE /api/notifications/:id              — delete a notification
router.delete("/:id", deleteNotification);

export default router;
