import z from "zod";

export const RegisterSchema = z.object({
  email: z.email(),

  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128),

  username: z
    .string()
    .min(3)
    .max(32)
    .regex(
      /^[a-zA-Z0-9_]+$/,
      "Handle may only contain letters, numbers, and underscores",
    ),

  displayName: z.string().min(1).max(64),
});

export const LoginSchema = z.object({
  email: z.email(),
  password: z.string(),
});

export type UserRegisterData = z.infer<typeof RegisterSchema>;
export type UserLoginData = z.infer<typeof LoginSchema>;
