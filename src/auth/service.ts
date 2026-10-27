import { eq } from "drizzle-orm";

import { dbClient } from "@/database/client";
import { profiles, users } from "@/database/schema";
import type { UserLoginData, UserRegisterData } from "./schema";

export async function registerUser(input: UserRegisterData) {
  // check if user exists
  const [existing] = await dbClient
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, input.email));

  // user already exists
  if (existing) return { ok: false, code: 409 as const };

  // username already taken
  const [taken] = await dbClient
    .select({ userId: profiles.userId })
    .from(profiles)
    .where(eq(profiles.username, input.username));

  if (taken) return { ok: false, code: 409 as const };

  // create a new user
  let user: { id: string; email: string };
  const passwordHash = await Bun.password.hash(input.password);

  try {
    user = await dbClient.transaction(async (tx) => {
      // create a user on db
      const [created] = await tx
        .insert(users)
        .values({ email: input.email, passwordHash })
        .returning({ id: users.id, email: users.email });

      if (!created) throw new Error("User insert returned no row");

      // create a user's profile on db
      await tx.insert(profiles).values({
        userId: created.id,
        username: input.username,
        displayName: input.displayName,
      });

      return created;
    });
  } catch {
    // DB error
    return { ok: false, code: 500 as const };
  }

  await sendVerificationEmail(user.email);

  return { ok: true, user };
}

export async function loginUser(input: UserLoginData) {
  const [user] = await dbClient
    .select()
    .from(users)
    .where(eq(users.email, input.email));

  const dummyHash = await Bun.password.hash("hPH2vm49hAvIK7vypi4ttveuY");
  const hash = user?.passwordHash ?? dummyHash;
  const valid = await Bun.password.verify(input.password, hash);

  if (!user || !valid) return { ok: false, error: "Invalid credentials" };
  return { ok: true, userId: user.id, email: user.email };
}

// TODO: wire up kafka for email sending service
async function sendVerificationEmail(email: string) {
  console.log(`email verification event: ${email}`);
}
