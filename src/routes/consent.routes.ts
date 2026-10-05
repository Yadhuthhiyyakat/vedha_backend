import { Router } from "express";
import {
  createConsentRequest,
  getPendingConsentRequests,
  getConsentStatus,
  respondToConsentRequest,
} from "../controllers/consent.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const router = Router();

// GET /api/consent/:requestId — public polling endpoint for verifiers
router.get("/:requestId", getConsentStatus);

router.use(requireAuth);

// POST /api/consent/requests — create a verification consent request
router.post("/requests", createConsentRequest);

// GET /api/consent/pending — mobile app queries pending requests
router.get("/pending", getPendingConsentRequests);

// POST /api/consent/:requestId/respond — mobile app approves/rejects with biometrics
router.post("/:requestId/respond", respondToConsentRequest);

export default router;
