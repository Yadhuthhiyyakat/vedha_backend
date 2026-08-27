import { Request, Response, NextFunction } from "express";

/**
 * errorHandler — global Express error handler.
 * Catches any unhandled errors thrown in routes/controllers
 * and returns a consistent JSON error response.
 */
export const errorHandler = (
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  console.error(`[${new Date().toISOString()}] Unhandled error:`, err);

  // Handle JSON parse errors (e.g. malformed JSON or submitting JSON text to file route)
  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({
      error: "Bad Request",
      message: "Invalid JSON format. For file uploads, select 'Form' / 'Form-data' (multipart/form-data) instead of JSON.",
    });
    return;
  }

  res.status(500).json({
    error: "Internal Server Error",
    message: err?.message || "An unexpected error occurred",
  });
};
