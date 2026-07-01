import z from "zod";

export const UserRegisterSchema = z.object({
  email: z.email(),

  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128),

  // aka handle, prepend @ in frontend
  // must be unique
  username: z
    .string()
    .min(3)
    .max(32)
    .regex(
      /^[a-zA-Z0-9_]+$/,
      "Handle may only contain letters, numbers, and underscores",
    ),

  // the name that will be displayed on profile ui
  displayName: z.string().min(1).max(64),
});

export const UserLoginSchema = z.object({
  email: z.email(),
  password: z.string(),
});

export type UserRegisterData = z.infer<typeof UserRegisterSchema>;
export type UserLoginData = z.infer<typeof UserLoginSchema>;
