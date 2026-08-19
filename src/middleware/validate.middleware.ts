import { Request, Response, NextFunction } from "express";
import { ZodError, type ZodSchema } from "zod";

/**
 * validate — middleware factory that validates req.body against a Zod schema.
 * Returns 422 with detailed field errors if validation fails.
 */
export const validate =
  (schema: ZodSchema) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      res.status(422).json({
        error: "Validation failed",
        details: errors,
      });
      return;
    }

    req.body = result.data;
    next();
  };
