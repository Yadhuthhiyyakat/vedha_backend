import { Request, Response, NextFunction } from "express";
import { ZodError, type ZodSchema } from "zod";

/**
 * validate — middleware factory that validates req[source] (body, query, params) against a Zod schema.
 * Defaults to validating req.body.
 * Returns 422 with detailed field errors if validation fails.
 */
export const validate =
  (schema: ZodSchema, source: "body" | "query" | "params" = "body") =>
  (req: Request, res: Response, next: NextFunction): void => {
    const dataToValidate = req[source];
    const result = schema.safeParse(dataToValidate);

    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      res.status(422).json({
        error: "Validation failed",
        details: errors,
      });
      return;
    }

    if (source === "body") {
      req.body = result.data;
    } else if (source === "query") {
      req.query = result.data as any;
    } else if (source === "params") {
      req.params = result.data as any;
    }
    next();
  };

