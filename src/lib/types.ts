export interface DocumentRecord {
	id: string;
	title: string;
	content: string;
	createdAt: number;
}

export interface UserRecord {
	id: string;
	name: string;
	color: string;
}

export interface CommentReply {
	id: string;
	text: string;
	authorId: string;
	createdAt: number;
	// Denormalized for display — stored directly in JSONB so no join is needed
	authorName?: string;
	authorColor?: string;
}

export interface CommentRecord {
	id: string;
	documentId: string;
	authorId: string;
	text: string;
	createdAt: number;
	resolved: boolean;
	type: "inline" | "document";
	replies: CommentReply[];
	/** For AI-created inline comments: the exact text to annotate, stored so the client can apply the ProseMirror mark */
	selectedText?: string;
	/** True while AI is processing this comment; cleared when AI finishes (reply, edit, or skip) */
	aiPending?: boolean;
	// Joined fields for UI convenience
	authorName?: string;
	authorColor?: string;
}
