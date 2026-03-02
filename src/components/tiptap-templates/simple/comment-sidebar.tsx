"use client";

import { CheckCircle2, RotateCcw, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/tiptap-ui-primitive/button";
import { AI_EDITOR_USER_ID } from "@/lib/ai-editor-constants";
import type { CommentRecord } from "@/lib/types";

export const CommentSidebar = ({
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
	comments: CommentRecord[];
	activeCommentId: string | null;
	onResolve: (id: string) => void;
	onDelete: (id: string) => void;
	onReply: (id: string, text: string) => void;
	onClose: () => void;
	onAddDocumentComment: (text: string) => void;
	currentUser: any;
	isDrafting: boolean;
	draftComment: string;
	setDraftComment: (text: string) => void;
	onCancelDraft: () => void;
	onPostDraft: () => void;
	onCommentClick: (id: string) => void;
}) => {
	const [replyText, setReplyText] = useState("");
	const [activeReplyId, setActiveReplyId] = useState<string | null>(null);
	const [documentCommentText, setDocumentCommentText] = useState("");
	const sidebarRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (activeCommentId) {
			const element = document.getElementById(`comment-${activeCommentId}`);
			if (element) {
				element.scrollIntoView({ behavior: "smooth", block: "nearest" });
			}
		}
	}, [activeCommentId]);

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
								setDraftComment(e.target.value);
								e.target.style.height = "auto";
								if (e.target.value) {
									e.target.style.height = `${e.target.scrollHeight}px`;
								}
							}}
							rows={1}
						/>
						<div className="drafting-buttons">
							<Button
								size="small"
								variant="ghost"
								onClick={(e) => {
									onCancelDraft();
									const textarea = e.currentTarget
										.closest(".drafting-comment")
										?.querySelector("textarea");
									if (textarea) textarea.style.height = "auto";
								}}
							>
								Cancel
							</Button>
							<Button
								size="small"
								disabled={!draftComment.trim()}
								onClick={(e) => {
									onPostDraft();
									const textarea = e.currentTarget
										.closest(".drafting-comment")
										?.querySelector("textarea");
									if (textarea) textarea.style.height = "auto";
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
								setDocumentCommentText(e.target.value);
								e.target.style.height = "auto";
								if (e.target.value) {
									e.target.style.height = `${e.target.scrollHeight}px`;
								}
							}}
							rows={1}
						/>
						<div className="drafting-buttons">
							<Button
								size="small"
								disabled={!documentCommentText.trim()}
								onClick={(e) => {
									onAddDocumentComment(documentCommentText);
									setDocumentCommentText("");
									const textarea = e.currentTarget
										.closest(".drafting-comment")
										?.querySelector("textarea");
									if (textarea) textarea.style.height = "auto";
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
									{(comment.authorName || "A")[0]}
								</div>
								<div className="author-info">
									<span className="author-name">
										{comment.authorName || "Anonymous"}
									</span>
									<span className="comment-date">
										{new Date(comment.createdAt).toLocaleDateString()}
									</span>
								</div>
								<div className="comment-actions">
									<button
										onClick={(e) => {
											e.stopPropagation();
											onResolve(comment.id);
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
											e.stopPropagation();
											onDelete(comment.id);
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
									{comment.replies
										.slice()
										.sort((a, b) => a.createdAt - b.createdAt)
										.map((reply) => (
											<div
												key={reply.id}
												className={`reply-item ${reply.authorId === AI_EDITOR_USER_ID ? "ai-reply" : ""}`}
											>
												<div className="reply-meta">
													<div
														className="author-avatar author-avatar--small"
														style={{
															backgroundColor: reply.authorColor ?? "#ccc",
														}}
													>
														{(reply.authorName ?? "A")[0]}
													</div>
													<span className="reply-author">
														{reply.authorName ?? "Anonymous"}
													</span>
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
													setReplyText(e.target.value);
													e.target.style.height = "auto";
													if (e.target.value) {
														e.target.style.height = `${e.target.scrollHeight}px`;
													}
												}}
												rows={1}
											/>
											<div className="reply-buttons">
												<Button
													size="small"
													variant="ghost"
													onClick={(e) => {
														setActiveReplyId(null);
														setReplyText("");
														const textarea = e.currentTarget
															.closest(".reply-input")
															?.querySelector("textarea");
														if (textarea) textarea.style.height = "auto";
													}}
												>
													Cancel
												</Button>
												<Button
													size="small"
													disabled={!replyText.trim()}
													onClick={(e) => {
														onReply(comment.id, replyText);
														setReplyText("");
														setActiveReplyId(null);
														const textarea = e.currentTarget
															.closest(".reply-input")
															?.querySelector("textarea");
														if (textarea) textarea.style.height = "auto";
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
	);
};
