import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email?: string;
    role?: string;
  };
  accessToken?: string;
}

/**
 * requireAuth — verifies the Supabase JWT in the Authorization header.
 * Attaches the decoded user payload to req.user.
 * Returns 401 if the token is missing or invalid.
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

  try {
    // Supabase JWT secrets are Base64-encoded — decode to raw bytes first
    const jwtSecret = Buffer.from(process.env.JWT_SECRET!, "base64");
    const decoded = jwt.verify(token, jwtSecret) as {
      sub: string;
      email?: string;
      role?: string;
    };

    req.user = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role,
    };
    req.accessToken = token;

    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
};

/**
 * optionalAuth — same as requireAuth but does NOT block the request if no token is provided.
 * Useful for endpoints that have both authenticated and anonymous access paths.
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
    const jwtSecret = Buffer.from(process.env.JWT_SECRET!, "base64");
    const decoded = jwt.verify(token, jwtSecret) as {
      sub: string;
      email?: string;
      role?: string;
    };

    req.user = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role,
    };
    req.accessToken = token;
  } catch {
    // Silently ignore invalid tokens for optional auth
  }

  next();
};
