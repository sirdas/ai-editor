import { createServerFn } from "@tanstack/react-start"
import {
  getDocuments,
  getDocument,
  createDocument,
  updateDocument,
  deleteDocument,
  getUser,
  createUser,
  updateUser,
  getComments,
  createComment,
  updateComment,
  deleteComment as dbDeleteComment,
  type CommentRecord,
} from "./db"
import { processCommentWithAI, ensureAiEditorUser, reviewDocumentWithAI } from "./ai-editor"

export const fetchDocuments = createServerFn({ method: "GET" }).handler(async () => {
  return getDocuments()
})

export const fetchDocument = createServerFn({ method: "GET" })
  .inputValidator((id: string) => id)
  .handler(async ({ data: id }) => {
    return getDocument(id)
  })

export const addDocumentFn = createServerFn({ method: "POST" })
  .inputValidator((data: { title: string; content?: string }) => data)
  .handler(async ({ data }) => {
    const id = crypto.randomUUID()
    return createDocument(id, data.title, data.content || "")
  })

export const updateDocumentFn = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; title?: string; content?: string }) => data)
  .handler(async ({ data }) => {
    const doc = await getDocument(data.id)
    if (!doc) throw new Error("Document not found")
    return await updateDocument(data.id, data.title ?? doc.title, data.content ?? doc.content)
  })

export const deleteDocumentFn = createServerFn({ method: "POST" })
  .inputValidator((id: string) => id)
  .handler(async ({ data: id }) => {
    await deleteDocument(id)
    return { success: true }
  })

// User functions
export const fetchUserFn = createServerFn({ method: "GET" })
  .inputValidator((id: string) => id)
  .handler(async ({ data: id }) => {
    return getUser(id)
  })

export const createUserFn = createServerFn({ method: "POST" })
  .inputValidator((data: { name: string; color: string }) => data)
  .handler(async ({ data }) => {
    const id = crypto.randomUUID()
    return createUser(id, data.name, data.color)
  })

export const updateUserFn = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; name: string }) => data)
  .handler(async ({ data }) => {
    return updateUser(data.id, data.name)
  })

// Comment functions
export const fetchCommentsFn = createServerFn({ method: "GET" })
  .inputValidator((documentId: string) => documentId)
  .handler(async ({ data: documentId }) => {
    return getComments(documentId)
  })

/**
 * Creates a comment and fires AI processing in the background.
 * `selectedText` is transient — used for AI context but not stored in the DB.
 */
export const createCommentFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: Omit<CommentRecord, "authorName" | "authorColor"> & { selectedText?: string }) => data,
  )
  .handler(async ({ data }) => {
    const { selectedText, ...commentData } = data
    const comment = await createComment(commentData)

    // Ensure the AI editor user exists (idempotent)
    ensureAiEditorUser().catch(console.error)

    // Fire-and-forget: process with AI without blocking the response
    processCommentWithAI({
      comment,
      documentId: commentData.documentId,
      selectedText,
    }).catch(console.error)

    return comment
  })

/**
 * Adds a reply to a comment thread and fires AI processing in the background.
 */
export const addReplyFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      commentId: string
      documentId: string
      reply: { id: string; text: string; authorId: string; createdAt: number; authorName?: string; authorColor?: string }
    }) => data,
  )
  .handler(async ({ data }) => {
    const comment = await getComments(data.documentId).then((comments) =>
      comments.find((c) => c.id === data.commentId),
    )
    if (!comment) throw new Error("Comment not found")

    const updatedReplies = [...comment.replies, data.reply]
    await updateComment(data.commentId, { replies: updatedReplies })

    // Fetch the updated comment for AI context
    const updatedComments = await getComments(data.documentId)
    const updatedComment = updatedComments.find((c) => c.id === data.commentId)
    if (updatedComment) {
      processCommentWithAI({
        comment: updatedComment,
        documentId: data.documentId,
        isReply: true,
        replyAuthorId: data.reply.authorId,
      }).catch(console.error)
    }

    return { success: true }
  })

export const updateCommentFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      id: string
      updates: Partial<Pick<CommentRecord, "text" | "resolved" | "replies">>
    }) => data,
  )
  .handler(async ({ data }) => {
    await updateComment(data.id, data.updates)
    return { success: true }
  })

export const deleteCommentFn = createServerFn({ method: "POST" })
  .inputValidator((id: string) => id)
  .handler(async ({ data: id }) => {
    await dbDeleteComment(id)
    return { success: true }
  })

export const requestAiReviewFn = createServerFn({ method: "POST" })
  .inputValidator((documentId: string) => documentId)
  .handler(async ({ data: documentId }) => {
    ensureAiEditorUser().catch(console.error)
    reviewDocumentWithAI(documentId).catch(console.error)
    return { success: true }
  })