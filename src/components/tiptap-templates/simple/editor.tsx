"use client"

import { useEffect, useRef, useState } from "react"
import { EditorContent, EditorContext, useCurrentEditor, useEditorState, useEditor } from "@tiptap/react"
import "tippy.js/dist/tippy.css"
import { Decoration, DecorationSet } from "@tiptap/pm/view"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Extension } from "@tiptap/core"

// --- Tiptap Core Extensions ---
import { StarterKit } from "@tiptap/starter-kit"
import { Image } from "@tiptap/extension-image"
import { TaskItem, TaskList } from "@tiptap/extension-list"
import { TextAlign } from "@tiptap/extension-text-align"
import { Typography } from "@tiptap/extension-typography"
import { Highlight } from "@tiptap/extension-highlight"
import { Subscript } from "@tiptap/extension-subscript"
import { Superscript } from "@tiptap/extension-superscript"
import { Selection } from "@tiptap/extensions"
import { Mark, mergeAttributes } from "@tiptap/core"

// --- Collaboration & Yjs ---
// Removed Yjs/Collaboration from this component as it's now DB-backed.

import { MessageSquarePlus, MessageSquare, X, Trash2, CheckCircle2, RotateCcw, Plus, FileText, User, Sparkles, ChevronLeft, ChevronRight } from "lucide-react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import {
  fetchDocuments, fetchDocument, updateDocumentFn, addDocumentFn, deleteDocumentFn,
  fetchUserFn, createUserFn, updateUserFn, fetchCommentsFn, createCommentFn, addReplyFn, updateCommentFn, deleteCommentFn as serverDeleteCommentFn, requestAiReviewFn
} from "@/lib/server-functions"
import { AI_EDITOR_USER_ID } from "@/lib/ai-editor-constants"
import { useNavigate } from "@tanstack/react-router"

// --- UI Primitives ---
import { Button } from "@/components/tiptap-ui-primitive/button"
import { Spacer } from "@/components/tiptap-ui-primitive/spacer"
import {
  Toolbar,
  ToolbarGroup,
  ToolbarSeparator,
} from "@/components/tiptap-ui-primitive/toolbar"

// --- Tiptap Node ---
import { ImageUploadNode } from "@/components/tiptap-node/image-upload-node/image-upload-node-extension"
import { HorizontalRule } from "@/components/tiptap-node/horizontal-rule-node/horizontal-rule-node-extension"
import "@/components/tiptap-node/blockquote-node/blockquote-node.scss"
import "@/components/tiptap-node/code-block-node/code-block-node.scss"
import "@/components/tiptap-node/horizontal-rule-node/horizontal-rule-node.scss"
import "@/components/tiptap-node/list-node/list-node.scss"
import "@/components/tiptap-node/image-node/image-node.scss"
import "@/components/tiptap-node/heading-node/heading-node.scss"
import "@/components/tiptap-node/paragraph-node/paragraph-node.scss"

// --- Tiptap UI ---
import { HeadingDropdownMenu } from "@/components/tiptap-ui/heading-dropdown-menu"
import { ImageUploadButton } from "@/components/tiptap-ui/image-upload-button"
import { ListDropdownMenu } from "@/components/tiptap-ui/list-dropdown-menu"
import { BlockquoteButton } from "@/components/tiptap-ui/blockquote-button"
import { CodeBlockButton } from "@/components/tiptap-ui/code-block-button"
import {
  ColorHighlightPopover,
  ColorHighlightPopoverContent,
  ColorHighlightPopoverButton,
} from "@/components/tiptap-ui/color-highlight-popover"
import {
  LinkPopover,
  LinkContent,
  LinkButton,
} from "@/components/tiptap-ui/link-popover"
import { MarkButton } from "@/components/tiptap-ui/mark-button"
import { TextAlignButton } from "@/components/tiptap-ui/text-align-button"
import { UndoRedoButton } from "@/components/tiptap-ui/undo-redo-button"

// --- Icons ---
import { ArrowLeftIcon } from "@/components/tiptap-icons/arrow-left-icon"
import { HighlighterIcon } from "@/components/tiptap-icons/highlighter-icon"
import { LinkIcon } from "@/components/tiptap-icons/link-icon"

// --- Hooks ---
import { useIsBreakpoint } from "@/hooks/use-is-breakpoint"
import { useWindowSize } from "@/hooks/use-window-size"
import { useCursorVisibility } from "@/hooks/use-cursor-visibility"

// --- Components ---
import { ThemeToggle } from "@/components/tiptap-templates/simple/theme-toggle"

// --- Lib ---
import { handleImageUpload, MAX_FILE_SIZE } from "@/lib/tiptap-utils"

// --- Styles ---
import "@/components/tiptap-templates/simple/editor.scss"


const colors = [
  "#958DF1",
  "#F98181",
  "#FBBC88",
  "#FAF594",
  "#70CFF8",
  "#94FADB",
  "#B9F18D",
]
const names = [
  "Lea Thompson",
  "Cyndi Lauper",
  "Tom Cruise",
  "Madonna",
  "Jerry Hall",
  "Joan Collins",
  "Winona Ryder",
  "Christina Applegate",
  "Alyssa Milano",
  "Molly Ringwald",
  "Ally Sheedy",
  "Debbie Harry",
  "Olivia Newton-John",
  "Elton John",
  "Michael J. Fox",
  "Axl Rose",
  "Emilio Estevez",
  "Ralph Macchio",
  "Rob Lowe",
  "Jennifer Grey",
  "Mickey Rourke",
  "John Cusack",
  "Matthew Broderick",
  "Justine Bateman",
  "Lisa Bonet",
]

const getRandomElement = (list: string[]) =>
  list[Math.floor(Math.random() * list.length)]

const getRandomColor = () => getRandomElement(colors)
const getRandomName = () => getRandomElement(names)

const getInitialUserId = () => {
  if (typeof window === "undefined") return null
  return localStorage.getItem("userId")
}

/**
 * Comment Mark Extension
 */
export const Comment = Mark.create({
  name: "comment",

  addAttributes() {
    return {
      commentId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-comment-id"),
        renderHTML: (attributes) => {
          if (!attributes.commentId) {
            return {}
          }
          return {
            "data-comment-id": attributes.commentId,
          }
        },
      },
    }
  },

  parseHTML() {
    return [{ tag: "span[data-comment-id]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes),
      0,
    ]
  },
})

interface CommentReply {
  id: string
  text: string
  authorId: string
  createdAt: number
  authorName?: string
  authorColor?: string
}

interface CommentData {
  id: string
  documentId: string
  authorId: string
  text: string
  createdAt: number
  resolved: boolean
  replies: CommentReply[]
  type: "inline" | "document"
  authorName?: string
  authorColor?: string
}

const CommentSidebar = ({
  comments,
  activeCommentId,
  onResolve,
  onDelete,
  onReply,
  onClose,
  onAddDocumentComment,
  currentUser,
  isDrafting,
  draftComment,
  setDraftComment,
  onCancelDraft,
  onPostDraft,
  onCommentClick,
}: {
  comments: CommentData[]
  activeCommentId: string | null
  onResolve: (id: string) => void
  onDelete: (id: string) => void
  onReply: (id: string, text: string) => void
  onClose: () => void
  onAddDocumentComment: (text: string) => void
  currentUser: any
  isDrafting: boolean
  draftComment: string
  setDraftComment: (text: string) => void
  onCancelDraft: () => void
  onPostDraft: () => void
  onCommentClick: (id: string) => void
}) => {
  const [replyText, setReplyText] = useState("")
  const [activeReplyId, setActiveReplyId] = useState<string | null>(null)
  const [documentCommentText, setDocumentCommentText] = useState("")
  const sidebarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (activeCommentId) {
      const element = document.getElementById(`comment-${activeCommentId}`)
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "nearest" })
      }
    }
  }, [activeCommentId])

  return (
    <div className="editor-sidebar" ref={sidebarRef}>
      <div className="sidebar-header">
        <h3>Comments</h3>
        <button onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      <div className="sidebar-content">
        <div className="commenting-as">
          Commenting as <strong>{currentUser?.name || "Anonymous"}</strong>
        </div>

        {isDrafting ? (
          <div className="drafting-comment">
            <div className="drafting-header">Add inline comment</div>
            <textarea
              autoFocus
              placeholder="What's your feedback?..."
              value={draftComment}
              onChange={(e) => {
                setDraftComment(e.target.value)
                e.target.style.height = "auto"
                if (e.target.value) {
                  e.target.style.height = `${e.target.scrollHeight}px`
                }
              }}
              rows={1}
            />
            <div className="drafting-buttons">
              <Button size="small" variant="ghost" onClick={(e) => {
                onCancelDraft()
                const textarea = e.currentTarget.closest('.drafting-comment')?.querySelector('textarea')
                if (textarea) textarea.style.height = 'auto'
              }}>
                Cancel
              </Button>
              <Button
                size="small"
                disabled={!draftComment.trim()}
                onClick={(e) => {
                  onPostDraft()
                  const textarea = e.currentTarget.closest('.drafting-comment')?.querySelector('textarea')
                  if (textarea) textarea.style.height = 'auto'
                }}
              >
                Post
              </Button>
            </div>
          </div>
        ) : (
          <div className="drafting-comment">
            <div className="drafting-header">Add document comment</div>
            <textarea
              placeholder="What's your feedback?..."
              value={documentCommentText}
              onChange={(e) => {
                setDocumentCommentText(e.target.value)
                e.target.style.height = "auto"
                if (e.target.value) {
                  e.target.style.height = `${e.target.scrollHeight}px`
                }
              }}
              rows={1}
            />
            <div className="drafting-buttons">
              <Button
                size="small"
                disabled={!documentCommentText.trim()}
                onClick={(e) => {
                  onAddDocumentComment(documentCommentText)
                  setDocumentCommentText("")
                  const textarea = e.currentTarget.closest('.drafting-comment')?.querySelector('textarea')
                  if (textarea) textarea.style.height = 'auto'
                }}
              >
                Post
              </Button>
            </div>
          </div>
        )}

        <div className="comments-list">
          {comments.map((comment) => (
            <div
              key={comment.id}
              id={`comment-${comment.id}`}
              className={`comment-item ${
                activeCommentId === comment.id ? "active" : ""
              } ${comment.resolved ? "resolved" : ""}`}
              onClick={() => onCommentClick(comment.id)}
            >
              <div className="comment-meta">
                <div
                  className="author-avatar"
                  style={{ backgroundColor: comment.authorColor }}
                >
                  { (comment.authorName || "A")[0] }
                </div>
                <div className="author-info">
                  <span className="author-name">{comment.authorName || "Anonymous"}</span>
                  <span className="comment-date">
                    {new Date(comment.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="comment-actions">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onResolve(comment.id)
                    }}
                    title={comment.resolved ? "Unresolve" : "Resolve"}
                  >
                    {comment.resolved ? (
                      <RotateCcw size={16} />
                    ) : (
                      <CheckCircle2 size={16} />
                    )}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onDelete(comment.id)
                    }}
                    title="Delete"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div className="comment-text">{comment.text}</div>

              {comment.replies.length > 0 && (
                <div className="comment-replies">
                  {comment.replies.slice().sort((a, b) => a.createdAt - b.createdAt).map((reply) => (
                    <div key={reply.id} className={`reply-item ${reply.authorId === AI_EDITOR_USER_ID ? "ai-reply" : ""}`}>
                      <div className="reply-meta">
                        <div
                          className="author-avatar author-avatar--small"
                          style={{ backgroundColor: reply.authorColor ?? "#ccc" }}
                        >
                          {(reply.authorName ?? "A")[0]}
                        </div>
                        <span className="reply-author">{reply.authorName ?? "Anonymous"}</span>
                      </div>
                      <div className="reply-text">{reply.text}</div>
                    </div>
                  ))}
                </div>
              )}

              {!comment.resolved && (
                <div className="reply-input">
                  {activeReplyId === comment.id ? (
                    <>
                      <textarea
                        autoFocus
                        placeholder="Reply..."
                        value={replyText}
                        onChange={(e) => {
                          setReplyText(e.target.value)
                          e.target.style.height = "auto"
                          if (e.target.value) {
                            e.target.style.height = `${e.target.scrollHeight}px`
                          }
                        }}
                        rows={1}
                      />
                      <div className="reply-buttons">
                        <Button
                          size="small"
                          variant="ghost"
                          onClick={(e) => {
                            setActiveReplyId(null)
                            setReplyText("")
                            const textarea = e.currentTarget.closest('.reply-input')?.querySelector('textarea')
                            if (textarea) textarea.style.height = 'auto'
                          }}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="small"
                          disabled={!replyText.trim()}
                          onClick={(e) => {
                            onReply(comment.id, replyText)
                            setReplyText("")
                            setActiveReplyId(null)
                            const textarea = e.currentTarget.closest('.reply-input')?.querySelector('textarea')
                            if (textarea) textarea.style.height = 'auto'
                          }}
                        >
                          Reply
                        </Button>
                      </div>
                    </>
                  ) : (
                    <button
                      className="reply-placeholder"
                      onClick={() => setActiveReplyId(comment.id)}
                    >
                      Reply...
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const MainToolbarContent = ({
  onHighlighterClick,
  onLinkClick,
  isMobile,
}: {
  onHighlighterClick: () => void
  onLinkClick: () => void
  isMobile: boolean
}) => {
  const { editor } = useCurrentEditor()
  const hasSelection = useEditorState({
    editor,
    selector: (ctx) => !ctx.editor?.state.selection.empty,
  })

  return (
    <>
      <Spacer />

      <ToolbarGroup>
        <UndoRedoButton action="undo" />
        <UndoRedoButton action="redo" />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <HeadingDropdownMenu levels={[1, 2, 3, 4]} portal={isMobile} />
        <ListDropdownMenu
          types={["bulletList", "orderedList", "taskList"]}
          portal={isMobile}
        />
        <BlockquoteButton />
        <CodeBlockButton />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <MarkButton type="bold" />
        <MarkButton type="italic" />
        <MarkButton type="strike" />
        <MarkButton type="code" />
        <MarkButton type="underline" />
        {!isMobile ? (
          <ColorHighlightPopover />
        ) : (
          <ColorHighlightPopoverButton onClick={onHighlighterClick} />
        )}
        {!isMobile ? <LinkPopover /> : <LinkButton onClick={onLinkClick} />}
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <MarkButton type="superscript" />
        <MarkButton type="subscript" />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <TextAlignButton align="left" />
        <TextAlignButton align="center" />
        <TextAlignButton align="right" />
        <TextAlignButton align="justify" />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <ImageUploadButton />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <Button
          variant="ghost"
          aria-disabled={!hasSelection}
          data-disabled={!hasSelection}
          onClick={() => hasSelection && window.dispatchEvent(new CustomEvent("add-comment"))}
          tooltip={hasSelection ? "Add Inline Comment" : "Select text to add an inline comment"}
        >
          <MessageSquarePlus className="tiptap-button-icon" />
        </Button>
        <Button
          variant="ghost"
          onClick={() => window.dispatchEvent(new CustomEvent("ai-review"))}
          tooltip="Request AI Review"
        >
          <Sparkles className="tiptap-button-icon" />
        </Button>
      </ToolbarGroup>

      <Spacer />

      {isMobile && <ToolbarSeparator />}

      <ToolbarSeparator />

      <ToolbarGroup>
        <ThemeToggle />
      </ToolbarGroup>
    </>
  )
}

const MobileToolbarContent = ({
  type,
  onBack,
}: {
  type: "highlighter" | "link"
  onBack: () => void
}) => (
  <>
    <ToolbarGroup>
      <Button variant="ghost" onClick={onBack}>
        <ArrowLeftIcon className="tiptap-button-icon" />
        {type === "highlighter" ? (
          <HighlighterIcon className="tiptap-button-icon" />
        ) : (
          <LinkIcon className="tiptap-button-icon" />
        )}
      </Button>
    </ToolbarGroup>

    <ToolbarSeparator />

    {type === "highlighter" ? (
      <ColorHighlightPopoverContent />
    ) : (
      <LinkContent />
    )}
  </>
)

export function Editor({ documentId, initialTitle, initialContent }: { documentId: string, initialTitle: string, initialContent: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const { data: docs = [] } = useQuery({
    queryKey: ['documents'],
    queryFn: () => fetchDocuments(),
  })
  const [title, setTitle] = useState(initialTitle)
  const isMobile = useIsBreakpoint()
  const { height } = useWindowSize()

  // User Management
  const [userId, setUserId] = useState<string | null>(getInitialUserId())
  const { data: currentUser } = useQuery({
    queryKey: ['user', userId],
    queryFn: () => fetchUserFn({ data: userId! }),
    enabled: !!userId,
  })

  useEffect(() => {
    if (!userId) {
      const name = getRandomName()
      const color = getRandomColor()
      createUserFn({ data: { name, color } }).then(newUser => {
        localStorage.setItem("userId", newUser.id)
        setUserId(newUser.id)
      })
    }
  }, [userId])

  const [mobileView, setMobileView] = useState<"main" | "highlighter" | "link">("main")

  // Comments Management — poll every 3s to pick up AI Editor replies
  const { data: comments = [] } = useQuery({
    queryKey: ['comments', documentId],
    queryFn: () => fetchCommentsFn({ data: documentId }),
    refetchInterval: 3000,
  })

  // Poll document content so AI-driven edits appear without a page refresh
  const { data: liveDocument } = useQuery({
    queryKey: ['document', documentId],
    queryFn: () => fetchDocument({ data: documentId }),
    refetchInterval: 3000,
  })

  // Track the last time the user made a local edit so we don't overwrite in-progress typing
  const lastUserEditRef = useRef<number>(0)

  // AI Editor snackbar
  // comment-level: derived from aiPending in DB (set by server, cleared when AI finishes)
  // review-level: local state since review creates new comments rather than updating existing ones
  const isAiProcessingComment = comments.some((c) => c.aiPending)
  const [reviewSnackbar, setReviewSnackbar] = useState(false)
  const reviewTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevCommentsRef = useRef<CommentData[]>([])

  const startAiProcessing = (message?: string) => {
    // Only used for the review flow
    if (message) {
      setReviewSnackbar(true)
      if (reviewTimeoutRef.current) clearTimeout(reviewTimeoutRef.current)
      reviewTimeoutRef.current = setTimeout(() => setReviewSnackbar(false), 60_000)
    }
  }

  // Hide review snackbar when new AI root comment appears (review is done)
  useEffect(() => {
    const prev = prevCommentsRef.current
    const hasNewAiRootComment = comments.some(
      (c) => c.authorId === AI_EDITOR_USER_ID && !prev.find((p) => p.id === c.id)
    )
    if (hasNewAiRootComment) {
      setReviewSnackbar(false)
      if (reviewTimeoutRef.current) { clearTimeout(reviewTimeoutRef.current); reviewTimeoutRef.current = null }
    }
    prevCommentsRef.current = comments
  }, [comments])

  const [activeCommentId, setActiveCommentId] = useState<string | null>(null)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isNavigatorOpen, setIsNavigatorOpen] = useState(false)
  const [isDrafting, setIsDrafting] = useState(false)
  const [draftComment, setDraftComment] = useState("")
  const toolbarRef = useRef<HTMLDivElement>(null)
  const [toolbarOverflow, setToolbarOverflow] = useState({ left: false, right: false })

  // Detect toolbar horizontal overflow to show/hide scroll buttons
  useEffect(() => {
    const el = toolbarRef.current
    if (!el) return

    const update = () => {
      setToolbarOverflow({
        left: el.scrollLeft > 1,
        right: el.scrollLeft < el.scrollWidth - el.clientWidth - 1,
      })
    }

    update()
    el.addEventListener("scroll", update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      el.removeEventListener("scroll", update)
      ro.disconnect()
    }
  }, [])

  // Force reset state when document id changes
  useEffect(() => {
    setTitle(initialTitle)
  }, [documentId, initialTitle])

  useEffect(() => {
    document.title = title || "ai-editor"
  }, [title])

  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    content: initialContent,
    editorProps: {
      attributes: {
        autocomplete: "off",
        autocorrect: "off",
        autocapitalize: "off",
        "aria-label": "Main content area, start typing to enter text.",
        class: "editor",
      },
    },
    extensions: [
      Extension.create({
        name: "activeCommentHighlight",
        addStorage() {
          return {
            activeCommentId: null as string | null,
            comments: [] as CommentData[],
          }
        },
        addProseMirrorPlugins() {
          return [
            new Plugin({
              key: new PluginKey("activeCommentHighlight"),
              props: {
                decorations: (state) => {
                  const activeId = this.storage.activeCommentId
                  const comments: CommentData[] = this.storage.comments || []
                  const decorations: Decoration[] = []

                  state.doc.descendants((node, pos) => {
                    const mark = node.marks.find((m) => m.type.name === "comment")
                    if (mark) {
                      const commentId = mark.attrs.commentId
                      const comment = comments.find((c) => c.id === commentId)
                      const isResolved = comment ? comment.resolved : false

                      if (!isResolved) {
                        const classes = ["comment-highlight"]
                        if (commentId === activeId) {
                          classes.push("active")
                        }

                        decorations.push(
                          Decoration.inline(pos, pos + node.nodeSize, {
                            class: classes.join(" "),
                          })
                        )
                      }
                    }
                  })
                  return DecorationSet.create(state.doc, decorations)
                },
              },
            }),
          ]
        },
      }),
      Comment,
      StarterKit.configure({
        horizontalRule: false,
        link: {
          openOnClick: false,
          enableClickSelection: true,
        },
      }),
      

      HorizontalRule,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight.configure({ multicolor: true }),
      Image,
      Typography,
      Superscript,
      Subscript,
      Selection,
      ImageUploadNode.configure({
        accept: "image/*",
        maxSize: MAX_FILE_SIZE,
        limit: 3,
        upload: handleImageUpload,
        onError: (error: any) => console.error("Upload failed:", error),
      }),
    ],
  })

  // Sync editor content when jumping to a new document
  useEffect(() => {
    if (editor) {
      if (editor.getHTML() !== initialContent) {
        editor.commands.setContent(initialContent)
      }
    }
  }, [documentId, initialContent, editor])

  // Save editor content on changes and record the edit timestamp
  useEffect(() => {
    if (!editor) return

    const handleUpdate = () => {
      lastUserEditRef.current = Date.now()
      const html = editor.getHTML()
      updateDocumentFn({ data: { id: documentId, content: html } })
    }

    editor.on('update', handleUpdate)

    return () => {
      editor.off('update', handleUpdate)
    }
  }, [editor, documentId])

  // Sync AI-driven document edits (content + title) into the editor.
  // Only runs when the DB content differs from the current editor content AND
  // the user hasn't typed in the last 2 seconds (to avoid stomping on active typing).
  useEffect(() => {
    if (!editor || !liveDocument) return
    if (Date.now() - lastUserEditRef.current < 2000) return
    if (liveDocument.content && liveDocument.content !== editor.getHTML()) {
      editor.commands.setContent(liveDocument.content)
    }
    if (liveDocument.title && liveDocument.title !== title) {
      setTitle(liveDocument.title)
      queryClient.invalidateQueries({ queryKey: ['documents'] })
    }
  }, [editor, liveDocument])

  const handleAddComment = () => {
    if (!editor) return

    const { empty } = editor.state.selection
    if (empty) return

    setIsSidebarOpen(true)
    setIsDrafting(true)
    setDraftComment("")
  }

  const handlePostDraft = async () => {
    if (!editor || !draftComment.trim() || !currentUser) return

    // Capture selected text while the selection is still active (before the mark is applied)
    const { from, to, empty } = editor.state.selection
    const selectedText = empty ? undefined : editor.state.doc.textBetween(from, to, " ")

    const id = Date.now().toString()
    const newComment: Omit<CommentData, "authorName" | "authorColor"> = {
      id,
      documentId,
      authorId: currentUser.id,
      text: draftComment,
      createdAt: Date.now(),
      replies: [],
      resolved: false,
      type: "inline",
    }

    await createCommentFn({ data: { ...newComment, selectedText } })
    queryClient.invalidateQueries({ queryKey: ['comments', documentId] })

    editor.chain().setMark("comment", { commentId: id }).run()

    setIsDrafting(false)
    setDraftComment("")
    setActiveCommentId(id)
  }

  const handleCancelDraft = () => {
    setIsDrafting(false)
    setDraftComment("")
  }

  useEffect(() => {
    if (!editor) return
    window.addEventListener("add-comment", handleAddComment)
    return () => window.removeEventListener("add-comment", handleAddComment)
  }, [editor])

  // Apply ProseMirror marks for AI-created inline comments that don't have one yet
  useEffect(() => {
    if (!editor) return
    const { state } = editor
    const markType = state.schema.marks.comment
    if (!markType) return

    const currentHtml = editor.getHTML()
    let tr = state.tr
    let changed = false

    for (const comment of comments) {
      if (comment.type !== "inline" || !comment.selectedText) continue
      if (currentHtml.includes(`data-comment-id="${comment.id}"`)) continue

      state.doc.descendants((node, pos) => {
        if (!node.isText || !node.text) return
        const idx = node.text.indexOf(comment.selectedText!)
        if (idx !== -1) {
          tr = tr.addMark(pos + idx, pos + idx + comment.selectedText!.length, markType.create({ commentId: comment.id }))
          changed = true
          return false
        }
      })
    }

    if (changed) editor.view.dispatch(tr)
  }, [editor, comments])

  // Trigger AI review
  useEffect(() => {
    const handleReview = () => {
      requestAiReviewFn({ data: documentId }).catch(console.error)
      startAiProcessing("AI Editor is reviewing the document. Please wait…")
      setIsSidebarOpen(true)
    }
    window.addEventListener("ai-review", handleReview)
    return () => window.removeEventListener("ai-review", handleReview)
  }, [documentId])

  useEffect(() => {
    if (editor) {
      editor.setOptions({
        editorProps: {
          handleClick: (view, pos) => {
            const { state } = view
            const $pos = state.doc.resolve(pos)
            const mark = $pos.marks().find((m: any) => m.type.name === "comment")
            if (mark) {
              const commentId = mark.attrs.commentId
              setActiveCommentId(commentId)
              setIsSidebarOpen(true)
              if ((editor.storage as any).activeCommentHighlight) {
                ;(editor.storage as any).activeCommentHighlight.activeCommentId = commentId
              }
            } else {
              setActiveCommentId(null)
              if ((editor.storage as any).activeCommentHighlight) {
                ;(editor.storage as any).activeCommentHighlight.activeCommentId = null
              }
            }
            return false
          },
        },
      })
    }
  }, [editor])

  // Save current user to localStorage and emit to editor
  useEffect(() => {
    if (editor) {
      if (currentUser) {
        localStorage.setItem("currentUser", JSON.stringify(currentUser))
      }
      // Sync comments to extension storage for decoration visibility
      if ((editor.storage as any).activeCommentHighlight) {
        ;(editor.storage as any).activeCommentHighlight.comments = comments
        // Force PM to re-run decorations when comments change
        editor.view.dispatch(editor.state.tr)
      }
    }
  }, [editor, currentUser, comments])

  const handleResolveComment = async (id: string) => {
    const comment = comments.find(c => c.id === id)
    if (comment) {
      await updateCommentFn({ data: { id, updates: { resolved: !comment.resolved } } })
      queryClient.invalidateQueries({ queryKey: ["comments", documentId] })
    }
  }

  const handleDeleteComment = async (id: string) => {
    await serverDeleteCommentFn({ data: id })
    queryClient.invalidateQueries({ queryKey: ["comments", documentId] })
  }

  const handleReplyToComment = async (commentId: string, text: string) => {
    if (!currentUser) return
    const reply: CommentReply = {
      id: crypto.randomUUID(),
      text,
      authorId: currentUser.id,
      authorName: currentUser.name,
      authorColor: currentUser.color,
      createdAt: Date.now(),
    }
    await addReplyFn({ data: { commentId, documentId, reply } })
    queryClient.invalidateQueries({ queryKey: ["comments", documentId] })
  }

  const handleAddDocumentComment = async (text: string) => {
    if (!currentUser) return
    const id = Date.now().toString()
    const newComment: Omit<CommentData, "authorName" | "authorColor"> = {
      id,
      documentId,
      authorId: currentUser.id,
      text,
      createdAt: Date.now(),
      replies: [],
      resolved: false,
      type: "document",
    }
    await createCommentFn({ data: newComment })
    queryClient.invalidateQueries({ queryKey: ["comments", documentId] })
    setActiveCommentId(id)
  }

  const handleCommentClick = (id: string) => {
    setActiveCommentId(id)
    if (editor) {
      // Sync active ID to extension storage for decoration
      ;(editor.storage as any).activeCommentHighlight.activeCommentId = id
      
      const { state } = editor
      let foundPos: number | null = null
      state.doc.descendants((node, pos) => {
        if (foundPos !== null) return false
        const mark = node.marks.find(
          (m) => m.type.name === "comment" && m.attrs.commentId === id
        )
        if (mark) {
          foundPos = pos
          // Smooth scroll to element without forcing text selection context (which causes gray highlight)
          const dom = editor.view.domAtPos(pos).node
          const element = dom instanceof HTMLElement ? dom : dom.parentElement
          if (element) {
            element.scrollIntoView({ behavior: "smooth", block: "center" })
          }
        }
      })
    }
  }

  const rect = useCursorVisibility({
    editor,
    overlayHeight: toolbarRef.current?.getBoundingClientRect().height ?? 0,
  })

  useEffect(() => {
    if (!isMobile && mobileView !== "main") {
      setMobileView("main")
    }
  }, [isMobile, mobileView])

  return (
    <div className={`editor-wrapper ${isSidebarOpen ? "sidebar-visible" : ""}`}>
      {(isAiProcessingComment || reviewSnackbar) && (
        <div className="ai-snackbar">
          <span className="ai-snackbar-dot" />
          {reviewSnackbar
            ? "AI Editor is reviewing the document. Please wait…"
            : "AI Editor is working on your comment. Please wait…"}
        </div>
      )}
      <div className="editor-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Button
            variant="ghost"
            size="small"
            style={{ padding: '4px' }}
            onClick={() => setIsNavigatorOpen(!isNavigatorOpen)}
            title="Toggle Documents"
          >
            <FileText size={18} />
          </Button>
          <div className="editor-status">
            <input 
              type="text" 
              value={title}
              suppressHydrationWarning
              onChange={(e) => {
                setTitle(e.target.value)
                updateDocumentFn({ data: { id: documentId, title: e.target.value }})
                queryClient.invalidateQueries({ queryKey: ['documents'] })
              }}
              className="document-title-input"
              placeholder="Untitled Document"
            />
          </div>
        </div>
        <div className="header-actions">
          <Button
            variant="ghost"
            size="small"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            title="Toggle Comments"
          >
            <MessageSquare size={18} />
          </Button>
          {mounted && currentUser && (
            <div className="user-name-wrapper" style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '4px', 
              background: 'rgba(0,0,0,0.05)', 
              padding: '2px 8px', 
              borderRadius: '4px',
              maxWidth: '200px',
              overflow: 'hidden'
            }}>
              <User size={14} style={{ color: currentUser.color, flexShrink: 0 }} />
              <div style={{ 
                display: 'inline-grid', 
                minWidth: '0', 
                flexGrow: 1,
                overflow: 'hidden'
              }}>
                <input 
                  type="text"
                  className="user-name-input"
                  value={currentUser.name}
                  suppressHydrationWarning
                  onChange={(e) => {
                    updateUserFn({ data: { id: currentUser.id, name: e.target.value } })
                    queryClient.setQueryData(['user', currentUser.id], { ...currentUser, name: e.target.value })
                  }}
                  style={{ 
                    gridArea: '1 / 1',
                    background: 'transparent', 
                    border: 'none', 
                    fontSize: '13px', 
                    fontWeight: 500,
                    width: '100%',
                    outline: 'none',
                    padding: 0,
                  }}
                />
                <span style={{ 
                  gridArea: '1 / 1',
                  visibility: 'hidden',
                  whiteSpace: 'pre',
                  fontSize: '13px',
                  fontWeight: 500,
                  padding: 0,
                  pointerEvents: 'none'
                }}>
                  {currentUser.name || ' '}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="editor-main-layout">
        <EditorContext.Provider value={{ editor }}>
          
        {/* Document Navigator */}
        {isNavigatorOpen && (
          <div className="document-navigator">
            <div className="navigator-header">
            <h3>Documents</h3>
            <Button size="small" variant="ghost" onClick={async () => {
              const newDoc = await addDocumentFn({ data: { title: "Untitled", content: "" }})
              queryClient.invalidateQueries({ queryKey: ['documents'] })
              navigate({ to: `/document/${newDoc.id}` })
            }}><Plus size={16} /></Button>
          </div>
          <div className="navigator-list">
             {docs.map(doc => (
               <div key={doc.id} className={`navigator-item ${doc.id === documentId ? 'active' : ''}`} onClick={() => navigate({ to: `/document/${doc.id}` })}>
                  <FileText size={16} />
                  <span className="navigator-title">{doc.title}</span>
                  <button onClick={(e) => {
                    e.stopPropagation()
                    deleteDocumentFn({ data: doc.id }).then(() => {
                      queryClient.invalidateQueries({ queryKey: ['documents'] })
                      if (doc.id === documentId) window.location.href = '/'
                    })
                  }}><Trash2 size={14}/></button>
               </div>
             ))}
          </div>
          </div>
        )}

          <div className="editor-container">
            <div className="toolbar-wrapper">
            {toolbarOverflow.left && (
              <button
                className="toolbar-scroll-btn toolbar-scroll-btn--left"
                onMouseDown={(e) => { e.preventDefault(); toolbarRef.current?.scrollBy({ left: -120, behavior: "smooth" }) }}
                aria-label="Scroll toolbar left"
              >
                <ChevronLeft size={14} />
              </button>
            )}
            {toolbarOverflow.right && (
              <button
                className="toolbar-scroll-btn toolbar-scroll-btn--right"
                onMouseDown={(e) => { e.preventDefault(); toolbarRef.current?.scrollBy({ left: 120, behavior: "smooth" }) }}
                aria-label="Scroll toolbar right"
              >
                <ChevronRight size={14} />
              </button>
            )}
            <Toolbar
              ref={toolbarRef}
              style={{
                ...(isMobile
                  ? {
                      bottom: `calc(100% - ${height - rect.y}px)`,
                    }
                  : {}),
              }}
            >
              {mobileView === "main" ? (
                <MainToolbarContent
                  onHighlighterClick={() => setMobileView("highlighter")}
                  onLinkClick={() => setMobileView("link")}
                  isMobile={isMobile}
                />
              ) : (
                <MobileToolbarContent
                  type={mobileView === "highlighter" ? "highlighter" : "link"}
                  onBack={() => setMobileView("main")}
                />
              )}
            </Toolbar>
            </div>

            <EditorContent
              editor={editor}
              role="presentation"
              className="editor-content"
            />
          </div>
        </EditorContext.Provider>

        {isSidebarOpen && (
          <CommentSidebar
            comments={comments}
            activeCommentId={activeCommentId}
            onResolve={handleResolveComment}
            onDelete={handleDeleteComment}
            onReply={handleReplyToComment}
            onClose={() => setIsSidebarOpen(false)}
            onAddDocumentComment={handleAddDocumentComment}
            currentUser={currentUser}
            isDrafting={isDrafting}
            draftComment={draftComment}
            setDraftComment={setDraftComment}
            onCancelDraft={handleCancelDraft}
            onPostDraft={handlePostDraft}
            onCommentClick={handleCommentClick}
          />
        )}
      </div>
    </div>
  )
}
