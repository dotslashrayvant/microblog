import z from "zod";

// Microblog posts are short-form.
const content = z.string().min(1).max(280);

export const CreatePostSchema = z.object({
  content,
  // optional, set to make this post a reply
  parentId: z.uuid().optional(),
});

export const ReplyBodySchema = z.object({ content });

export const UpdatePostSchema = z.object({ content });

export const PostIdParamSchema = z.object({ id: z.uuid() });

// Newest-first paging for the /users/.../posts list endpoints.
export const PostListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type CreatePostData = z.infer<typeof CreatePostSchema>;
export type UpdatePostData = z.infer<typeof UpdatePostSchema>;
export type PostListQuery = z.infer<typeof PostListQuerySchema>;
