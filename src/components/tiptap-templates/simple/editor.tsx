"use client";

import { EditorContent, EditorContext, useEditor } from "@tiptap/react";
import { useEffect, useMemo, useRef, useState } from "react";
import "tippy.js/dist/tippy.css";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Extension } from "@tiptap/core";
// --- Collaboration & Yjs ---
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import { Highlight } from "@tiptap/extension-highlight";
import { Image } from "@tiptap/extension-image";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Subscript } from "@tiptap/extension-subscript";
import { Superscript } from "@tiptap/extension-superscript";
import { TextAlign } from "@tiptap/extension-text-align";
import { Typography } from "@tiptap/extension-typography";
import { Selection } from "@tiptap/extensions";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
// --- Tiptap Core Extensions ---
import { StarterKit } from "@tiptap/starter-kit";
import {
	ChevronLeft,
	ChevronRight,
	FileText,
	MessageSquare,
	Plus,
	Trash2,
	User,
} from "lucide-react";
import * as Y from "yjs";
import { HorizontalRule } from "@/components/tiptap-node/horizontal-rule-node/horizontal-rule-node-extension";
// --- Tiptap Node ---
import { ImageUploadNode } from "@/components/tiptap-node/image-upload-node/image-upload-node-extension";

// --- UI Primitives ---
import { Button } from "@/components/tiptap-ui-primitive/button";
import { Toolbar } from "@/components/tiptap-ui-primitive/toolbar";
import { AI_EDITOR_USER_ID } from "@/lib/ai-editor-constants";
import {
	addDocumentFn,
	addReplyFn,
	createCommentFn,
	createUserFn,
	deleteDocumentFn,
	fetchCommentsFn,
	fetchDocument,
	fetchDocuments,
	fetchUserFn,
	requestAiReviewFn,
	deleteCommentFn as serverDeleteCommentFn,
	updateCommentFn,
	updateDocumentFn,
	updateUserFn,
} from "@/lib/server-functions";
import "@/components/tiptap-node/blockquote-node/blockquote-node.scss";
import "@/components/tiptap-node/code-block-node/code-block-node.scss";
import "@/components/tiptap-node/horizontal-rule-node/horizontal-rule-node.scss";
import "@/components/tiptap-node/list-node/list-node.scss";
import "@/components/tiptap-node/image-node/image-node.scss";
import "@/components/tiptap-node/heading-node/heading-node.scss";
import "@/components/tiptap-node/paragraph-node/paragraph-node.scss";
import { Comment } from "@/components/tiptap-node/comment-node/comment-mark-extension";
// --- Template components ---
import { CommentSidebar } from "@/components/tiptap-templates/simple/comment-sidebar";
import {
	MainToolbarContent,
	MobileToolbarContent,
} from "@/components/tiptap-templates/simple/toolbar-content";
import {
	getInitialUserId,
	getRandomColor,
	getRandomName,
} from "@/components/tiptap-templates/simple/user-utils";
import { useCursorVisibility } from "@/hooks/use-cursor-visibility";
// --- Hooks ---
import { useIsBreakpoint } from "@/hooks/use-is-breakpoint";
import { useWindowSize } from "@/hooks/use-window-size";
// --- Lib ---
import { handleImageUpload, MAX_FILE_SIZE } from "@/lib/tiptap-utils";
import type { CommentRecord } from "@/lib/types";

// --- Styles ---
import "@/components/tiptap-templates/simple/editor.scss";

export function Editor({
	documentId,
	initialTitle,
	initialContent,
}: {
	documentId: string;
	initialTitle: string;
	initialContent: string;
}) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	const { data: docs = [] } = useQuery({
		queryKey: ["documents"],
		queryFn: () => fetchDocuments(),
	});
	const [title, setTitle] = useState(initialTitle);
	const isMobile = useIsBreakpoint();
	const { height } = useWindowSize();

	// User Management
	const [userId, setUserId] = useState<string | null>(getInitialUserId());
	const { data: currentUser } = useQuery({
		queryKey: ["user", userId],
		queryFn: () => fetchUserFn({ data: userId! }),
		enabled: !!userId,
	});

	useEffect(() => {
		if (!userId) {
			const name = getRandomName();
			const color = getRandomColor();
			createUserFn({ data: { name, color } }).then((newUser) => {
				localStorage.setItem("userId", newUser.id);
				setUserId(newUser.id);
			});
		}
	}, [userId]);

	const [mobileView, setMobileView] = useState<"main" | "highlighter" | "link">(
		"main",
	);

	// Comments Management — poll every 3s to pick up AI Editor replies
	const { data: comments = [] } = useQuery({
		queryKey: ["comments", documentId],
		queryFn: () => fetchCommentsFn({ data: documentId }),
		refetchInterval: 3000,
	});

	// Poll document content so AI-driven edits appear without a page refresh
	const { data: liveDocument } = useQuery({
		queryKey: ["document", documentId],
		queryFn: () => fetchDocument({ data: documentId }),
		refetchInterval: 3000,
	});

	// Track the last time the user made a local edit so we don't overwrite in-progress typing
	const lastUserEditRef = useRef<number>(0);

	// Per-document Yjs doc shared between Collaboration (content) and CollaborationCaret (cursors).
	// Room name is versioned so that any previously accumulated server state is ignored.
	const editorRef = useRef<ReturnType<typeof useEditor>>(null);
	const initialContentRef = useRef(initialContent);
	initialContentRef.current = initialContent;
	const needsSeedRef = useRef(false);

	const { ydoc, caretProvider } = useMemo(() => {
		const ydoc = new Y.Doc();
		const caretProvider = new HocuspocusProvider({
			url: "wss://xk2o6wwm.collab.tiptap.cloud",
			name: `doc-v2-${documentId}`,
			document: ydoc,
			onSynced() {
				// Only seed from DB when the server room is brand-new (empty Y.XmlFragment).
				// On subsequent loads the server already holds the authoritative Yjs state.
				const fragment = ydoc.getXmlFragment("default");
				if (fragment.length === 0) {
					if (editorRef.current) {
						editorRef.current.commands.setContent(
							initialContentRef.current,
						);
					} else {
						needsSeedRef.current = true;
					}
				}
			},
		});
		return { ydoc, caretProvider };
	}, [documentId]);

	// Clean up when switching documents or unmounting
	useEffect(() => {
		return () => {
			caretProvider.destroy();
			ydoc.destroy();
		};
	}, [caretProvider, ydoc]);

	// AI Editor snackbar
	// comment-level: derived from aiPending in DB (set by server, cleared when AI finishes)
	// review-level: local state since review creates new comments rather than updating existing ones
	const isAiProcessingComment = comments.some((c) => c.aiPending);
	const [reviewSnackbar, setReviewSnackbar] = useState(false);
	const reviewTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const prevCommentsRef = useRef<CommentRecord[]>([]);

	const startAiProcessing = (message?: string) => {
		// Only used for the review flow
		if (message) {
			setReviewSnackbar(true);
			if (reviewTimeoutRef.current) clearTimeout(reviewTimeoutRef.current);
			reviewTimeoutRef.current = setTimeout(
				() => setReviewSnackbar(false),
				60_000,
			);
		}
	};

	// Hide review snackbar when new AI root comment appears (review is done)
	useEffect(() => {
		const prev = prevCommentsRef.current;
		const hasNewAiRootComment = comments.some(
			(c) =>
				c.authorId === AI_EDITOR_USER_ID && !prev.find((p) => p.id === c.id),
		);
		if (hasNewAiRootComment) {
			setReviewSnackbar(false);
			if (reviewTimeoutRef.current) {
				clearTimeout(reviewTimeoutRef.current);
				reviewTimeoutRef.current = null;
			}
		}
		prevCommentsRef.current = comments;
	}, [comments]);

	const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
	const [isSidebarOpen, setIsSidebarOpen] = useState(false);
	const [isNavigatorOpen, setIsNavigatorOpen] = useState(false);
	const [isDrafting, setIsDrafting] = useState(false);
	const [draftComment, setDraftComment] = useState("");
	const toolbarRef = useRef<HTMLDivElement>(null);
	const [toolbarOverflow, setToolbarOverflow] = useState({
		left: false,
		right: false,
	});

	// Detect toolbar horizontal overflow to show/hide scroll buttons
	useEffect(() => {
		const el = toolbarRef.current;
		if (!el) return;

		const update = () => {
			setToolbarOverflow({
				left: el.scrollLeft > 1,
				right: el.scrollLeft < el.scrollWidth - el.clientWidth - 1,
			});
		};

		update();
		el.addEventListener("scroll", update, { passive: true });
		const ro = new ResizeObserver(update);
		ro.observe(el);
		return () => {
			el.removeEventListener("scroll", update);
			ro.disconnect();
		};
	}, []);

	// Force reset state when document id changes
	useEffect(() => {
		setTitle(initialTitle);
	}, [documentId, initialTitle]);

	useEffect(() => {
		document.title = title || "ai-editor";
	}, [title]);

	const editor = useEditor(
		{
			immediatelyRender: false,
			shouldRerenderOnTransaction: false,
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
							comments: [] as CommentRecord[],
						};
					},
					addProseMirrorPlugins() {
						return [
							new Plugin({
								key: new PluginKey("activeCommentHighlight"),
								props: {
									decorations: (state) => {
										const activeId = this.storage.activeCommentId;
										const comments: CommentRecord[] =
											this.storage.comments || [];
										const decorations: Decoration[] = [];

										state.doc.descendants((node, pos) => {
											const mark = node.marks.find(
												(m) => m.type.name === "comment",
											);
											if (mark) {
												const commentId = mark.attrs.commentId;
												const comment = comments.find(
													(c) => c.id === commentId,
												);
												const isResolved = comment ? comment.resolved : false;

												if (!isResolved) {
													const classes = ["comment-highlight"];
													if (commentId === activeId) {
														classes.push("active");
													}

													decorations.push(
														Decoration.inline(pos, pos + node.nodeSize, {
															class: classes.join(" "),
														}),
													);
												}
											}
										});
										return DecorationSet.create(state.doc, decorations);
									},
								},
							}),
						];
					},
				}),
				Comment,
				StarterKit.configure({
					horizontalRule: false,
					link: {
						openOnClick: false,
						enableClickSelection: true,
					},
					undoRedo: false,
				}),
				Collaboration.configure({ document: ydoc }),
				CollaborationCaret.configure({
					provider: caretProvider,
					user: (() => {
						try {
							const stored = localStorage.getItem("currentUser");
							if (stored) {
								const u = JSON.parse(stored);
								if (u.name && u.color) return { name: u.name, color: u.color };
							}
						} catch {}
						return { name: getRandomName(), color: getRandomColor() };
					})(),
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
		},
		[documentId],
	);

	// Keep editorRef current; apply any pending seed that arrived before the editor was ready
	useEffect(() => {
		editorRef.current = editor;
		if (editor && needsSeedRef.current) {
			needsSeedRef.current = false;
			editor.commands.setContent(initialContentRef.current);
		}
	}, [editor]);

	// Save editor content on changes and record the edit timestamp
	useEffect(() => {
		if (!editor) return;

		const handleUpdate = () => {
			lastUserEditRef.current = Date.now();
			const html = editor.getHTML();
			updateDocumentFn({ data: { id: documentId, content: html } });
		};

		editor.on("update", handleUpdate);

		return () => {
			editor.off("update", handleUpdate);
		};
	}, [editor, documentId]);

	// Sync AI-driven document edits (content + title) into the editor.
	// Only runs when the DB content differs from the current editor content AND
	// the user hasn't typed in the last 2 seconds (to avoid stomping on active typing).
	// Guard: skip if the Yjs document hasn't synced yet — calling setContent before the
	// server sync would write to the empty ydoc and cause a merge-duplication on the next load.
	useEffect(() => {
		if (!editor || !liveDocument) return;
		if (ydoc.getXmlFragment("default").length === 0) return;
		if (Date.now() - lastUserEditRef.current < 2000) return;
		if (liveDocument.content && liveDocument.content !== editor.getHTML()) {
			editor.commands.setContent(liveDocument.content);
		}
		if (liveDocument.title && liveDocument.title !== title) {
			setTitle(liveDocument.title);
			queryClient.invalidateQueries({ queryKey: ["documents"] });
		}
	}, [editor, liveDocument]);

	const handleAddComment = () => {
		if (!editor) return;

		const { empty } = editor.state.selection;
		if (empty) return;

		setIsSidebarOpen(true);
		setIsDrafting(true);
		setDraftComment("");
	};

	const handlePostDraft = async () => {
		if (!editor || !draftComment.trim() || !currentUser) return;

		// Capture selected text while the selection is still active (before the mark is applied)
		const { from, to, empty } = editor.state.selection;
		const selectedText = empty
			? undefined
			: editor.state.doc.textBetween(from, to, " ");

		const id = Date.now().toString();
		const newComment: Omit<CommentRecord, "authorName" | "authorColor"> = {
			id,
			documentId,
			authorId: currentUser.id,
			text: draftComment,
			createdAt: Date.now(),
			replies: [],
			resolved: false,
			type: "inline",
		};

		await createCommentFn({ data: { ...newComment, selectedText } });
		queryClient.invalidateQueries({ queryKey: ["comments", documentId] });

		editor.chain().setMark("comment", { commentId: id }).run();

		setIsDrafting(false);
		setDraftComment("");
		setActiveCommentId(id);
	};

	const handleCancelDraft = () => {
		setIsDrafting(false);
		setDraftComment("");
	};

	useEffect(() => {
		if (!editor) return;
		window.addEventListener("add-comment", handleAddComment);
		return () => window.removeEventListener("add-comment", handleAddComment);
	}, [editor]);

	// Apply ProseMirror marks for AI-created inline comments that don't have one yet
	useEffect(() => {
		if (!editor) return;
		const { state } = editor;
		const markType = state.schema.marks.comment;
		if (!markType) return;

		const currentHtml = editor.getHTML();
		let tr = state.tr;
		let changed = false;

		for (const comment of comments) {
			if (comment.type !== "inline" || !comment.selectedText) continue;
			if (currentHtml.includes(`data-comment-id="${comment.id}"`)) continue;

			state.doc.descendants((node, pos) => {
				if (!node.isText || !node.text) return;
				const idx = node.text.indexOf(comment.selectedText!);
				if (idx !== -1) {
					tr = tr.addMark(
						pos + idx,
						pos + idx + comment.selectedText!.length,
						markType.create({ commentId: comment.id }),
					);
					changed = true;
					return false;
				}
			});
		}

		if (changed) editor.view.dispatch(tr);
	}, [editor, comments]);

	// Trigger AI review
	useEffect(() => {
		const handleReview = () => {
			requestAiReviewFn({ data: documentId }).catch(console.error);
			startAiProcessing("AI Editor is reviewing the document. Please wait…");
			setIsSidebarOpen(true);
		};
		window.addEventListener("ai-review", handleReview);
		return () => window.removeEventListener("ai-review", handleReview);
	}, [documentId]);

	useEffect(() => {
		if (editor) {
			editor.setOptions({
				editorProps: {
					handleClick: (view, pos) => {
						const { state } = view;
						const $pos = state.doc.resolve(pos);
						const mark = $pos
							.marks()
							.find((m: any) => m.type.name === "comment");
						if (mark) {
							const commentId = mark.attrs.commentId;
							setActiveCommentId(commentId);
							setIsSidebarOpen(true);
							if ((editor.storage as any).activeCommentHighlight) {
								(editor.storage as any).activeCommentHighlight.activeCommentId =
									commentId;
							}
						} else {
							setActiveCommentId(null);
							if ((editor.storage as any).activeCommentHighlight) {
								(editor.storage as any).activeCommentHighlight.activeCommentId =
									null;
							}
						}
						return false;
					},
				},
			});
		}
	}, [editor]);

	// Save current user to localStorage and update CollaborationCaret awareness
	useEffect(() => {
		if (editor && currentUser) {
			localStorage.setItem("currentUser", JSON.stringify(currentUser));
			editor.commands.updateUser({
				name: currentUser.name,
				color: currentUser.color,
			});
		}
	}, [editor, currentUser]);

	useEffect(() => {
		if (editor) {
			// Sync comments to extension storage for decoration visibility
			if ((editor.storage as any).activeCommentHighlight) {
				(editor.storage as any).activeCommentHighlight.comments = comments;
				// Force PM to re-run decorations when comments change
				editor.view.dispatch(editor.state.tr);
			}
		}
	}, [editor, comments]);

	const handleResolveComment = async (id: string) => {
		const comment = comments.find((c) => c.id === id);
		if (comment) {
			await updateCommentFn({
				data: { id, updates: { resolved: !comment.resolved } },
			});
			queryClient.invalidateQueries({ queryKey: ["comments", documentId] });
		}
	};

	const handleDeleteComment = async (id: string) => {
		await serverDeleteCommentFn({ data: id });
		queryClient.invalidateQueries({ queryKey: ["comments", documentId] });
	};

	const handleReplyToComment = async (commentId: string, text: string) => {
		if (!currentUser) return;
		const reply = {
			id: crypto.randomUUID(),
			text,
			authorId: currentUser.id,
			authorName: currentUser.name,
			authorColor: currentUser.color,
			createdAt: Date.now(),
		};
		await addReplyFn({ data: { commentId, documentId, reply } });
		queryClient.invalidateQueries({ queryKey: ["comments", documentId] });
	};

	const handleAddDocumentComment = async (text: string) => {
		if (!currentUser) return;
		const id = Date.now().toString();
		const newComment: Omit<CommentRecord, "authorName" | "authorColor"> = {
			id,
			documentId,
			authorId: currentUser.id,
			text,
			createdAt: Date.now(),
			replies: [],
			resolved: false,
			type: "document",
		};
		await createCommentFn({ data: newComment });
		queryClient.invalidateQueries({ queryKey: ["comments", documentId] });
		setActiveCommentId(id);
	};

	const handleCommentClick = (id: string) => {
		setActiveCommentId(id);
		if (editor) {
			// Sync active ID to extension storage for decoration
			(editor.storage as any).activeCommentHighlight.activeCommentId = id;

			const { state } = editor;
			let foundPos: number | null = null;
			state.doc.descendants((node, pos) => {
				if (foundPos !== null) return false;
				const mark = node.marks.find(
					(m) => m.type.name === "comment" && m.attrs.commentId === id,
				);
				if (mark) {
					foundPos = pos;
					// Smooth scroll to element without forcing text selection context (which causes gray highlight)
					const dom = editor.view.domAtPos(pos).node;
					const element = dom instanceof HTMLElement ? dom : dom.parentElement;
					if (element) {
						element.scrollIntoView({ behavior: "smooth", block: "center" });
					}
				}
			});
		}
	};

	const rect = useCursorVisibility({
		editor,
		overlayHeight: toolbarRef.current?.getBoundingClientRect().height ?? 0,
	});

	useEffect(() => {
		if (!isMobile && mobileView !== "main") {
			setMobileView("main");
		}
	}, [isMobile, mobileView]);

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
				<div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
					<Button
						variant="ghost"
						size="small"
						style={{ padding: "4px" }}
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
								setTitle(e.target.value);
								updateDocumentFn({
									data: { id: documentId, title: e.target.value },
								});
								queryClient.invalidateQueries({ queryKey: ["documents"] });
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
						<div
							className="user-name-wrapper"
							style={{
								display: "flex",
								alignItems: "center",
								gap: "4px",
								background: "rgba(0,0,0,0.05)",
								padding: "2px 8px",
								borderRadius: "4px",
								maxWidth: "200px",
								overflow: "hidden",
							}}
						>
							<User
								size={14}
								style={{ color: currentUser.color, flexShrink: 0 }}
							/>
							<div
								style={{
									display: "inline-grid",
									minWidth: "0",
									flexGrow: 1,
									overflow: "hidden",
								}}
							>
								<input
									type="text"
									className="user-name-input"
									value={currentUser.name}
									suppressHydrationWarning
									onChange={(e) => {
										updateUserFn({
											data: { id: currentUser.id, name: e.target.value },
										});
										queryClient.setQueryData(["user", currentUser.id], {
											...currentUser,
											name: e.target.value,
										});
									}}
									style={{
										gridArea: "1 / 1",
										background: "transparent",
										border: "none",
										fontSize: "13px",
										fontWeight: 500,
										width: "100%",
										outline: "none",
										padding: 0,
									}}
								/>
								<span
									style={{
										gridArea: "1 / 1",
										visibility: "hidden",
										whiteSpace: "pre",
										fontSize: "13px",
										fontWeight: 500,
										padding: 0,
										pointerEvents: "none",
									}}
								>
									{currentUser.name || " "}
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
								<Button
									size="small"
									variant="ghost"
									onClick={async () => {
										const newDoc = await addDocumentFn({
											data: { title: "Untitled", content: "" },
										});
										queryClient.invalidateQueries({ queryKey: ["documents"] });
										navigate({ to: `/document/${newDoc.id}` });
									}}
								>
									<Plus size={16} />
								</Button>
							</div>
							<div className="navigator-list">
								{docs.map((doc) => (
									<div
										key={doc.id}
										className={`navigator-item ${doc.id === documentId ? "active" : ""}`}
										onClick={() => navigate({ to: `/document/${doc.id}` })}
									>
										<FileText size={16} />
										<span className="navigator-title">{doc.title}</span>
										<button
											onClick={(e) => {
												e.stopPropagation();
												deleteDocumentFn({ data: doc.id }).then(() => {
													queryClient.invalidateQueries({
														queryKey: ["documents"],
													});
													if (doc.id === documentId) window.location.href = "/";
												});
											}}
										>
											<Trash2 size={14} />
										</button>
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
									onMouseDown={(e) => {
										e.preventDefault();
										toolbarRef.current?.scrollBy({
											left: -120,
											behavior: "smooth",
										});
									}}
									aria-label="Scroll toolbar left"
								>
									<ChevronLeft size={14} />
								</button>
							)}
							{toolbarOverflow.right && (
								<button
									className="toolbar-scroll-btn toolbar-scroll-btn--right"
									onMouseDown={(e) => {
										e.preventDefault();
										toolbarRef.current?.scrollBy({
											left: 120,
											behavior: "smooth",
										});
									}}
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
	);
}
