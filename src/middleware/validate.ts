import type { Context, ValidationTargets } from "hono";
import { zValidator } from "@hono/zod-validator";
import type { ZodType } from "zod";

type ValidationIssue = { path: PropertyKey[]; message: string };

// The one 400 shape for every route: { error: [{ field, message }] } (see README).
function badRequest(c: Context, issues: readonly ValidationIssue[]) {
  return c.json(
    {
      error: issues.map((issue) => ({
        field: issue.path.map(String).join("."),
        message: issue.message,
      })),
    },
    400,
  );
}

// zValidator with the shared 400 hook, e.g. validate("json", CreatePostSchema).
export const validate = <
  T extends ZodType,
  Target extends keyof ValidationTargets,
>(
  target: Target,
  schema: T,
) =>
  zValidator(target, schema, (result, c) => {
    if (!result.success) return badRequest(c, result.error.issues);
  });
