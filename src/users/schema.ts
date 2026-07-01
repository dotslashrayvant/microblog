import z from "zod";

// Handle rules, kept in sync with UserRegisterSchema.username in ../auth/schema.
const handle = z
  .string()
  .min(3)
  .max(32)
  .regex(
    /^[a-zA-Z0-9_]+$/,
    "Handle may only contain letters, numbers, and underscores",
  );

export const UserIdParamSchema = z.object({
  id: z.uuid(),
});

export const UsernameParamSchema = z.object({
  username: handle,
});

// PATCH /users/me partial profile update.
// Absent key = leave untouched, value = set, null = clear (optional fields only).
export const UpdateProfileSchema = z
  .object({
    displayName: z.string().min(1).max(64),
    bio: z.string().max(500).nullable(),
    birthDate: z.iso.date().nullable(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export type UpdateProfileData = z.infer<typeof UpdateProfileSchema>;
