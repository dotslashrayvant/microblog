import z from "zod";

export const UserRegisterSchema = z.object({
  email: z.email(),

  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128),

  handle: z
    .string()
    .min(3)
    .max(32)
    .regex(
      /^[a-zA-Z0-9_]+$/,
      "Handle may only contain letters, numbers, and underscores",
    ),

  displayName: z.string().min(1).max(64),
});

export type UserRegisterData = z.infer<typeof UserRegisterSchema>;
