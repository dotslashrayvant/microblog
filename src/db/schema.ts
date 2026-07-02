import { sql } from "drizzle-orm";
import {
  pgTable,
  primaryKey,
  check,
  uuid,
  varchar,
  text,
  timestamp,
  boolean,
  date,
  type AnyPgColumn,
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

export const posts = pgTable("posts", {
  id: uuid("id").defaultRandom().primaryKey(),

  authorId: uuid("author_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),

  // self-referential; null = top-level post, set = reply.
  // cascades: deleting a post removes its reply subtree.
  parentId: uuid("parent_id").references((): AnyPgColumn => posts.id, {
    onDelete: "cascade",
  }),

  content: text("content").notNull(),

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

// One row per (user, post) - the composite PK makes likes idempotent.
// Both FKs cascade, so deleting a post or user clears its likes.
export const likes = pgTable(
  "likes",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },

  (t) => [primaryKey({ columns: [t.userId, t.postId] })],
);

// One row per (follower, followee) - the composite PK makes follows
// idempotent, like likes/reposts. The check constraint backs up the
// service-level self-follow guard.
export const follows = pgTable(
  "follows",
  {
    followerId: uuid("follower_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    followeeId: uuid("followee_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },

  (t) => [
    primaryKey({ columns: [t.followerId, t.followeeId] }),
    check("no_self_follow", sql`${t.followerId} <> ${t.followeeId}`),
  ],
);

// one repost per (user, post).
export const reposts = pgTable(
  "reposts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    postId: uuid("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },

  (t) => [primaryKey({ columns: [t.userId, t.postId] })],
);
