import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  date,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),

  // email must be unique
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),

  // if false, limit functionality
  emailVerified: boolean("email_verified").default(false).notNull(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const profiles = pgTable("profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),

  // aka handle, prepend @ in frontend
  // must be unique
  username: varchar("username", { length: 32 }).notNull().unique(),

  // the name that will be displayed on profile ui
  displayName: varchar("display_name", { length: 64 }).notNull(),

  // optional
  bio: text("bio"),
  birthDate: date(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
