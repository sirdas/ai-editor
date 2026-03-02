import { generateText, stepCountIs } from "ai"
import { anthropic } from "@ai-sdk/anthropic"
import { z } from "zod"
import {
  getDocument,
  updateDocument,
  updateComment,
  getComments,
  createComment,
  getUser,
  createUser,
  type CommentRecord,
} from "./db"
import { AI_EDITOR_USER_ID, AI_EDITOR_NAME, AI_EDITOR_COLOR } from "./ai-editor-constants"

export { AI_EDITOR_USER_ID, AI_EDITOR_NAME, AI_EDITOR_COLOR }

export async function ensureAiEditorUser() {
  const existing = await getUser(AI_EDITOR_USER_ID)
  if (!existing) {
    await createUser(AI_EDITOR_USER_ID, AI_EDITOR_NAME, AI_EDITOR_COLOR)
  }
}

/** Build a readable thread for a comment including all replies with author names */
function formatThread(comment: CommentRecord): string {
  const lines: string[] = [`**${comment.authorName ?? comment.authorId}**: ${comment.text}`]
  for (const reply of comment.replies) {
    const name =
      reply.authorId === AI_EDITOR_USER_ID ? AI_EDITOR_NAME : (reply.authorName ?? reply.authorId)
    lines.push(`  ↳ **${name}**: ${reply.text}`)
  }
  return lines.join("\n")
}

export async function processCommentWithAI(params: {
  comment: CommentRecord
  documentId: string
  /** Plain text of the highlighted region (inline comments only), captured client-side */
  selectedText?: string
  /** True when this is triggered by a new reply rather than the root comment */
  isReply?: boolean
  /** authorId of the newest reply (to avoid responding to our own replies) */
  replyAuthorId?: string
}): Promise<void> {
  const { comment, documentId, selectedText, isReply = false, replyAuthorId } = params

  // Never process our own messages
  if (!isReply && comment.authorId === AI_EDITOR_USER_ID) return
  if (isReply && replyAuthorId === AI_EDITOR_USER_ID) return

  await ensureAiEditorUser()

  const [document, allComments] = await Promise.all([
    getDocument(documentId),
    getComments(documentId),
  ])
  if (!document) return

  // The text that triggered the AI (root comment or latest reply)
  const triggerText = isReply
    ? (comment.replies[comment.replies.length - 1]?.text ?? "")
    : comment.text

  const isAddressed =
    triggerText.toLowerCase().includes("@ai-editor") ||
    triggerText.toLowerCase().includes("@ai editor")

  const currentThread = formatThread(comment)

  const otherComments = allComments
    .filter((c) => c.id !== comment.id && !c.resolved)
    .map((c) => `- [${c.type}] ${c.authorName ?? c.authorId}: ${c.text}`)
    .join("\n")

  let documentContent = document.content ?? ""

  const systemPrompt = `You are an AI writing editor called "AI Editor" collaborating on a document.
You can read and modify the document content using the tools provided.

DOCUMENT TITLE: "${document.title}"

DOCUMENT CONTENT (tiptap-compatible HTML):
${documentContent}

${selectedText ? `REFERENCED TEXT (the exact text this inline comment is about):\n"${selectedText}"` : ""}

OTHER OPEN COMMENTS IN THIS DOCUMENT:
${otherComments || "(none)"}

YOUR RULES:
1. If directly addressed with "@ai-editor", always respond and perform the requested action.
2. If NOT directly addressed, only intervene when genuinely valuable — e.g. to mediate a prolonged debate, flag a factual error, or catch something important. Otherwise call the "skip" tool.
3. Whenever you edit the document, briefly explain what you changed in your reply text.
4. Keep replies concise and professional.
5. For text operations, prefer "replaceText" for targeted edits and "setDocumentContent" only for structural rewrites.
6. Valid tiptap HTML tags: <p>, <h1>–<h4>, <strong>, <em>, <ul>, <ol>, <li>, <blockquote>, <code>, <pre>, <s>, <u>, <mark>, <a href="...">, <hr>.`

  const userMessage = `${isReply ? "New reply posted in a comment thread" : `New ${comment.type} comment posted`}:

${currentThread}

${isAddressed ? "This message is addressed to you — please respond and perform any requested actions." : "Decide whether you should respond. If not, call the 'skip' tool."}`

  let skipped = false

  const { text } = await generateText({
    model: anthropic("claude-sonnet-4-6"),
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
    stopWhen: stepCountIs(5),
    tools: {
      replaceText: {
        description:
          "Find and replace a specific string of text in the document. Use for targeted edits (style, translation, rewriting a sentence/paragraph). The search is exact.",
        inputSchema: z.object({
          originalText: z
            .string()
            .describe("The exact text to find in the document (plain text, not HTML)"),
          newText: z
            .string()
            .describe(
              "The replacement text. May include basic tiptap HTML tags if formatting is needed.",
            ),
        }),
        execute: async (input: { originalText: string; newText: string }) => {
          if (documentContent.includes(input.originalText)) {
            documentContent = documentContent.replace(input.originalText, input.newText)
            await updateDocument(documentId, document.title, documentContent)
            return { success: true }
          }
          return { success: false, error: "Exact text not found in document." }
        },
      },

      setDocumentContent: {
        description:
          "Replace the entire document content with new HTML. Use only for major structural changes (reordering sections, adding headings throughout, etc.).",
        inputSchema: z.object({
          html: z
            .string()
            .describe("The complete new tiptap-compatible HTML content for the document."),
        }),
        execute: async (input: { html: string }) => {
          documentContent = input.html
          await updateDocument(documentId, document.title, input.html)
          return { success: true }
        },
      },

      renameDocument: {
        description: "Rename the document title.",
        inputSchema: z.object({
          title: z.string().describe("The new title for the document."),
        }),
        execute: async (input: { title: string }) => {
          await updateDocument(documentId, input.title, documentContent)
          return { success: true }
        },
      },

      resolveComment: {
        description: "Mark this comment thread as resolved. Only use this when the user has explicitly asked you to resolve the comment.",
        inputSchema: z.object({}),
        execute: async (_input: Record<string, never>) => {
          await updateComment(comment.id, { resolved: true })
          return { success: true }
        },
      },

      skip: {
        description:
          "Use this when you decide not to respond to a comment that was not addressed to you.",
        inputSchema: z.object({
          reason: z.string().describe("Brief internal reason for skipping (not shown to users)."),
        }),
        execute: async (_input: { reason: string }) => {
          skipped = true
          return { skipped: true }
        },
      },
    },
  })

  if (!skipped && text.trim()) {
    const reply = {
      id: crypto.randomUUID(),
      text: text.trim(),
      authorId: AI_EDITOR_USER_ID,
      authorName: AI_EDITOR_NAME,
      authorColor: AI_EDITOR_COLOR,
      createdAt: Date.now(),
    }
    await updateComment(comment.id, {
      replies: [...comment.replies, reply],
    })
  }
}

export async function reviewDocumentWithAI(documentId: string): Promise<void> {
  await ensureAiEditorUser()

  const [document, allComments] = await Promise.all([
    getDocument(documentId),
    getComments(documentId),
  ])
  if (!document) return

  const existingComments = allComments
    .map((c) => `- [${c.type}] ${c.authorName ?? c.authorId}: ${c.text}`)
    .join("\n")

  const systemPrompt = `You are an AI writing editor called "AI Editor" performing an editorial review of a document.

DOCUMENT TITLE: "${document.title}"

DOCUMENT CONTENT (tiptap-compatible HTML):
${document.content ?? "(empty)"}

EXISTING COMMENTS (already raised — do not duplicate):
${existingComments || "(none)"}

YOUR TASK:
Review the document carefully and annotate it using the tools provided. Be selective and useful:
- Use "addInlineComment" to attach a comment to a specific passage (grammar, clarity, style, consistency, factual concerns, etc.)
- Use "addDocumentComment" for high-level observations that apply to the document as a whole
- Do NOT duplicate feedback already covered by existing comments
- Prefer targeted inline comments over vague document-level ones
- When done, call "finishReview" — do not generate any final text response

The "selectedText" you pass to "addInlineComment" must be an exact verbatim substring of the document.`

  await generateText({
    model: anthropic("claude-sonnet-4-6"),
    system: systemPrompt,
    prompt: "Please review the document now.",
    stopWhen: stepCountIs(4),
    tools: {
      addInlineComment: {
        description:
          "Attach an inline comment to a specific passage of text in the document. The selectedText must appear verbatim in the document.",
        inputSchema: z.object({
          selectedText: z
            .string()
            .describe("The exact text substring to annotate (copied verbatim from the document)."),
          commentText: z.string().describe("The editorial comment to attach to this passage."),
        }),
        execute: async (input: { selectedText: string; commentText: string }) => {
          if (!document.content?.includes(input.selectedText)) {
            return { success: false, error: "selectedText not found verbatim in document." }
          }
          await createComment({
            id: crypto.randomUUID(),
            documentId,
            authorId: AI_EDITOR_USER_ID,
            text: input.commentText,
            createdAt: Date.now(),
            resolved: false,
            type: "inline",
            replies: [],
            selectedText: input.selectedText,
          })
          return { success: true }
        },
      },

      addDocumentComment: {
        description: "Add a general editorial comment about the document as a whole.",
        inputSchema: z.object({
          commentText: z.string().describe("The general comment to add."),
        }),
        execute: async (input: { commentText: string }) => {
          await createComment({
            id: crypto.randomUUID(),
            documentId,
            authorId: AI_EDITOR_USER_ID,
            text: input.commentText,
            createdAt: Date.now(),
            resolved: false,
            type: "document",
            replies: [],
          })
          return { success: true }
        },
      },

      finishReview: {
        description: "Call this when you have finished reviewing the document.",
        inputSchema: z.object({}),
        execute: async (_input: Record<string, never>) => ({ done: true }),
      },
    },
  })
}
