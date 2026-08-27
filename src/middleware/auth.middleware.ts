import { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../config/supabase.js";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email?: string;
    role?: string;
  };
  accessToken?: string;
}

/**
 * requireAuth — verifies the Supabase access token via Supabase Auth API.
 * Attaches the user payload to req.user.
 * Returns 401 if the token is missing, invalid, or expired.
 */
export const requireAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or malformed Authorization header" });
    return;
  }

  const token = authHeader.split(" ")[1]!;

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  req.user = {
    id: user.id,
    email: user.email,
    role: user.role,
  };
  req.accessToken = token;

  next();
};

/**
 * optionalAuth — same as requireAuth but does NOT block the request if no token is provided.
 */
export const optionalAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    next();
    return;
  }

  const token = authHeader.split(" ")[1]!;

  try {
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (user) {
      req.user = {
        id: user.id,
        email: user.email,
        role: user.role,
      };
      req.accessToken = token;
    }
  } catch {
    // Silently ignore invalid tokens for optional auth
  }

  next();
};

