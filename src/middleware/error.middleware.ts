import { Request, Response, NextFunction } from "express";

/**
 * errorHandler — global Express error handler.
 * Catches any unhandled errors thrown in routes/controllers
 * and returns a consistent JSON error response.
 */
export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction // eslint-disable-line @typescript-eslint/no-unused-vars
): void => {
  console.error(`[${new Date().toISOString()}] Unhandled error:`, err);

  res.status(500).json({
    error: "Internal Server Error",
    message: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
};
