import { createServerFn } from '@tanstack/react-start'
import { getDocuments, getDocument, createDocument, updateDocument, deleteDocument, getUser, createUser, updateUser, getComments, createComment, updateComment, deleteComment as dbDeleteComment, type CommentRecord } from './db'

export const fetchDocuments = createServerFn({ method: "GET" })
  .handler(async () => {
    return getDocuments()
  })

export const fetchDocument = createServerFn({ method: "GET" })
  .inputValidator((id: string) => id)
  .handler(async ({ data: id }) => {
    return getDocument(id)
  })

export const addDocumentFn = createServerFn({ method: "POST" })
  .inputValidator((data: { title: string, content?: string }) => data)
  .handler(async ({ data }) => {
    const id = crypto.randomUUID()
    return createDocument(id, data.title, data.content || "")
  })

export const updateDocumentFn = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string, title?: string, content?: string }) => data)
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
  .inputValidator((data: { name: string, color: string }) => data)
  .handler(async ({ data }) => {
    const id = crypto.randomUUID()
    return createUser(id, data.name, data.color)
  })

export const updateUserFn = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string, name: string }) => data)
  .handler(async ({ data }) => {
    return updateUser(data.id, data.name)
  })

// Comment functions
export const fetchCommentsFn = createServerFn({ method: "GET" })
  .inputValidator((documentId: string) => documentId)
  .handler(async ({ data: documentId }) => {
    return getComments(documentId)
  })

export const createCommentFn = createServerFn({ method: "POST" })
  .inputValidator((data: Omit<CommentRecord, "authorName" | "authorColor">) => data)
  .handler(async ({ data }) => {
    return createComment(data)
  })

export const updateCommentFn = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string, updates: Partial<Pick<CommentRecord, "text" | "resolved" | "replies">> }) => data)
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
