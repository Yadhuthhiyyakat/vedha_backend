import { Router } from "express";
import { getLinkedDevices, revokeDevice } from "../controllers/device.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();
router.use(requireAuth);

router.get("/", getLinkedDevices);
router.delete("/:deviceId", revokeDevice);

export default router;
