import {
	AI_EDITOR_COLOR,
	AI_EDITOR_NAME,
	AI_EDITOR_USER_ID,
} from "./ai-editor-constants";
import {
	AMPERSAND_MODEL,
	createSession,
	type FunctionTool,
	type InputMessage,
	type RequiredAction,
	type SessionEvent,
	type SessionInput,
	sendSessionEvents,
	streamSessionEvents,
} from "./ampersand";
import {
	type CommentRecord,
	claimAmpersandToolCall,
	createComment,
	type DocumentRecord,
	getAmpersandSessionId,
	getComments,
	getDocument,
	setAmpersandSessionId,
	updateComment,
	updateDocument,
} from "./db";

// Each document has one Ampersand session, which keeps the conversation history server-side.
// A session's instructions and tools are fixed when it's created, so every message carries
// the current document instead of the instructions.

const INSTRUCTIONS = `You are "${AI_EDITOR_NAME}", an AI co-author in a collaborative document editor. People write a document together and discuss it in comment threads; you take part like any other author.

Each message is an event from the editor: a new comment, a new reply in a comment thread, or a review request. It ends with the current document as tiptap HTML. People keep editing between messages, so always work from the latest copy.

Comments:
- Talk to people only with replyToComment, using the thread's comment ID. Text you write outside a tool call is not shown to anyone.
- A comment that mentions @ai-editor is addressed to you: reply, and carry out any requested changes.
- Otherwise, step in only when it clearly helps, e.g. to settle a long back-and-forth, flag a factual error, or catch something important. If you have nothing useful to add, finish without calling any tool.
- When you change the document, say briefly in your reply what you changed.
- Only resolve a thread when someone explicitly asks you to.
- Keep replies concise and professional.

Editing:
- Prefer replaceText for targeted edits; use setDocumentContent only for structural rewrites.
- Valid tiptap HTML tags: <p>, <h1>–<h4>, <strong>, <em>, <ul>, <ol>, <li>, <blockquote>, <code>, <pre>, <s>, <u>, <mark>, <a href="...">, <hr>.

Reviews:
- Annotate the document with addInlineComment for specific passages (grammar, clarity, style, consistency, factual concerns) and addDocumentComment for points about the document as a whole. Prefer targeted inline comments.
- Don't repeat feedback that open comments already cover, and don't re-raise resolved ones.`;

/** A function tool whose parameters are all required strings, given as name → description */
function tool(
	name: string,
	description: string,
	parameters: Record<string, string>,
): FunctionTool {
	return {
		type: "function",
		name,
		description,
		parameters: {
			type: "object",
			properties: Object.fromEntries(
				Object.entries(parameters).map(([key, about]) => [
					key,
					{ type: "string", description: about },
				]),
			),
			required: Object.keys(parameters),
			additionalProperties: false,
		},
	};
}

const TOOLS = [
	tool(
		"replyToComment",
		"Post a reply in a comment thread. This is the only way to talk to people: text outside a tool call is not shown to anyone.",
		{ commentId: "ID of the thread's comment.", text: "The reply." },
	),
	tool(
		"replaceText",
		"Find and replace a specific string of text in the document. Use for targeted edits (style, translation, rewriting a sentence/paragraph). The search is exact.",
		{
			originalText:
				"The exact text to find in the document (plain text, not HTML).",
			newText:
				"The replacement text. May include basic tiptap HTML tags if formatting is needed.",
		},
	),
	tool(
		"setDocumentContent",
		"Replace the entire document content with new HTML. Use only for major structural changes (reordering sections, adding headings throughout, etc.).",
		{
			html: "The complete new tiptap-compatible HTML content for the document.",
		},
	),
	tool("renameDocument", "Rename the document title.", {
		title: "The new title for the document.",
	}),
	tool(
		"resolveComment",
		"Mark a comment thread as resolved. Only use this when someone has explicitly asked you to resolve it.",
		{ commentId: "ID of the thread's comment." },
	),
	tool(
		"addInlineComment",
		"Attach an inline comment to a specific passage of text in the document. The selectedText must appear verbatim in the document.",
		{
			selectedText:
				"The exact text substring to annotate (copied verbatim from the document).",
			commentText: "The editorial comment to attach to this passage.",
		},
	),
	tool(
		"addDocumentComment",
		"Add a general editorial comment about the document as a whole.",
		{ commentText: "The general comment to add." },
	),
];

async function requireDocument(documentId: string): Promise<DocumentRecord> {
	const document = await getDocument(documentId);
	if (!document) throw new Error("Document not found.");
	return document;
}

async function requireComment(
	documentId: string,
	commentId: string,
): Promise<CommentRecord> {
	const comment = (await getComments(documentId)).find(
		(c) => c.id === commentId,
	);
	if (!comment) throw new Error(`No comment with ID ${commentId}.`);
	return comment;
}

async function runTool(
	documentId: string,
	name: string,
	args: Record<string, string>,
): Promise<string> {
	switch (name) {
		case "replyToComment": {
			const comment = await requireComment(documentId, args.commentId);
			const reply = {
				id: crypto.randomUUID(),
				text: args.text,
				authorId: AI_EDITOR_USER_ID,
				authorName: AI_EDITOR_NAME,
				authorColor: AI_EDITOR_COLOR,
				createdAt: Date.now(),
			};
			await updateComment(comment.id, { replies: [...comment.replies, reply] });
			return "Reply posted.";
		}
		case "replaceText": {
			const document = await requireDocument(documentId);
			if (!document.content.includes(args.originalText)) {
				throw new Error("Exact text not found in document.");
			}
			// A replacer function keeps "$&"-style patterns in newText literal
			const content = document.content.replace(
				args.originalText,
				() => args.newText,
			);
			await updateDocument(documentId, document.title, content);
			return "Text replaced.";
		}
		case "setDocumentContent": {
			const document = await requireDocument(documentId);
			await updateDocument(documentId, document.title, args.html);
			return "Document content replaced.";
		}
		case "renameDocument": {
			const document = await requireDocument(documentId);
			await updateDocument(documentId, args.title, document.content);
			return "Document renamed.";
		}
		case "resolveComment": {
			const comment = await requireComment(documentId, args.commentId);
			await updateComment(comment.id, { resolved: true });
			return "Comment resolved.";
		}
		case "addInlineComment": {
			const document = await requireDocument(documentId);
			if (!document.content.includes(args.selectedText)) {
				throw new Error("selectedText not found verbatim in document.");
			}
			await createComment({
				id: crypto.randomUUID(),
				documentId,
				authorId: AI_EDITOR_USER_ID,
				text: args.commentText,
				createdAt: Date.now(),
				resolved: false,
				type: "inline",
				replies: [],
				selectedText: args.selectedText,
			});
			return "Comment added.";
		}
		case "addDocumentComment": {
			await createComment({
				id: crypto.randomUUID(),
				documentId,
				authorId: AI_EDITOR_USER_ID,
				text: args.commentText,
				createdAt: Date.now(),
				resolved: false,
				type: "document",
				replies: [],
			});
			return "Comment added.";
		}
		default:
			throw new Error(`Unknown tool: ${name}`);
	}
}

/** Runs the actions no other worker has claimed and sends their results in one request */
async function runRequiredActions(
	documentId: string,
	sessionId: string,
	actions: RequiredAction[],
): Promise<number> {
	const claimed: RequiredAction[] = [];
	for (const action of actions) {
		if (
			await claimAmpersandToolCall(sessionId, action.turn_id, action.call_id)
		) {
			claimed.push(action);
		}
	}
	if (claimed.length === 0) return 0;

	// Sequential on purpose: the tools read and rewrite the same document
	const results: SessionInput[] = [];
	for (const action of claimed) {
		const result = await runTool(
			documentId,
			action.name,
			action.arguments as Record<string, string>,
		).then(
			(output) => ({ success: true, output }),
			(error: unknown) => ({
				success: false,
				error: error instanceof Error ? error.message : String(error),
			}),
		);
		results.push({
			type: "agent.session.input.tool_result",
			turn_id: action.turn_id,
			call_id: action.call_id,
			...result,
		});
	}
	await sendSessionEvents(
		sessionId,
		results,
		`results:${claimed[0].turn_id}:${claimed[0].call_id}`,
	);
	return claimed.length;
}

const SESSION_TIMEOUT_MS = 5 * 60_000;
// The model sometimes repeats a tool call, so a turn that keeps calling tools is cancelled
const MAX_TOOL_CALLS = 25;

/** Handles tool calls until the session has processed the message and gone idle */
async function followSession(
	documentId: string,
	events: AsyncGenerator<SessionEvent>,
): Promise<void> {
	// An existing session may report it's idle before it picks up the new message
	let started = false;
	let toolCalls = 0;
	for await (const event of events) {
		const session = event.session;
		switch (event.type) {
			case "agent.session.created":
				if (session) await setAmpersandSessionId(documentId, session.id);
				break;
			case "agent.session.requires_action": {
				const actions = session?.required_actions ?? [];
				if (!session || actions.length === 0) break;
				if (toolCalls >= MAX_TOOL_CALLS) {
					await sendSessionEvents(
						session.id,
						[{ type: "agent.session.input.cancel" }],
						`cancel:${actions[0].turn_id}`,
					);
					break;
				}
				toolCalls += await runRequiredActions(documentId, session.id, actions);
				break;
			}
			case "agent.session.idle":
				if (started) return;
				break;
			case "agent.session.failed":
				throw new Error(`Ampersand session failed: ${session?.error}`);
			case "agent.session.turn.failed":
				console.error(
					`Ampersand turn ${event.turn?.id} failed: ${event.turn?.error?.message}`,
				);
				break;
			case "error":
				throw new Error(`Ampersand stream error: ${event.error?.message}`);
		}
		started ||= event.type !== "agent.session.idle";
	}
	throw new Error("Ampersand stream closed before the session went idle.");
}

async function sendToDocumentSession(
	documentId: string,
	message: InputMessage,
): Promise<void> {
	const signal = AbortSignal.timeout(SESSION_TIMEOUT_MS);
	const sessionId = await getAmpersandSessionId(documentId);
	if (!sessionId) {
		const events = await createSession(
			{
				agent: {
					model: AMPERSAND_MODEL,
					instructions: INSTRUCTIONS,
					tools: TOOLS,
				},
				input: [message],
				metadata: { documentId },
			},
			signal,
		);
		return followSession(documentId, events);
	}
	// Subscribe before sending so none of this message's events are missed
	const events = await streamSessionEvents(sessionId, signal);
	await sendSessionEvents(
		sessionId,
		[{ type: "agent.session.input.message", input: [message] }],
		String(message.metadata?.id),
	);
	return followSession(documentId, events);
}

function displayName(authorId: string, authorName?: string): string {
	return authorId === AI_EDITOR_USER_ID
		? AI_EDITOR_NAME
		: (authorName ?? authorId);
}

function formatThread(comment: CommentRecord): string {
	return [
		`**${displayName(comment.authorId, comment.authorName)}**: ${comment.text}`,
		...comment.replies.map(
			(reply) =>
				`  ↳ **${displayName(reply.authorId, reply.authorName)}**: ${reply.text}`,
		),
	].join("\n");
}

function formatDocument(document: DocumentRecord): string {
	return `Current document "${document.title}" (tiptap HTML):\n${document.content || "(empty)"}`;
}

export async function processCommentWithAmpersand(params: {
	comment: CommentRecord;
	documentId: string;
	/** Plain text of the highlighted region (inline comments only), captured client-side */
	selectedText?: string;
	/** True when this is triggered by a new reply rather than the root comment */
	isReply?: boolean;
}): Promise<void> {
	const { comment, documentId, isReply = false } = params;
	try {
		const document = await requireDocument(documentId);
		const trigger = isReply
			? comment.replies[comment.replies.length - 1]
			: comment;
		const selectedText = params.selectedText ?? comment.selectedText;
		const text = [
			isReply
				? `New reply in comment thread ${comment.id}:`
				: `New ${comment.type} comment ${comment.id}:`,
			formatThread(comment),
			selectedText ? `The thread is about this passage: "${selectedText}"` : "",
			formatDocument(document),
		]
			.filter(Boolean)
			.join("\n\n");
		await sendToDocumentSession(documentId, {
			role: "user",
			content: [{ type: "input_text", text }],
			metadata: {
				id: trigger.id,
				source: "comments",
				sender: trigger.authorId,
				sender_name: displayName(trigger.authorId, trigger.authorName),
				channel: `comment:${comment.id}`,
				timestamp: Math.floor(trigger.createdAt / 1000),
			},
		});
	} finally {
		await updateComment(comment.id, { aiPending: false });
	}
}

export async function reviewDocumentWithAmpersand(
	documentId: string,
): Promise<void> {
	const [document, comments] = await Promise.all([
		requireDocument(documentId),
		getComments(documentId),
	]);
	const existingComments = comments
		.map(
			(c) =>
				`- [${c.resolved ? "RESOLVED" : "OPEN"}][${c.type}] comment ${c.id}: ${formatThread(c)}`,
		)
		.join("\n");
	const text = [
		"Review requested: review the document now and annotate it with addInlineComment and addDocumentComment.",
		`Existing comments (resolved threads are for context only):\n${existingComments || "(none)"}`,
		formatDocument(document),
	].join("\n\n");
	await sendToDocumentSession(documentId, {
		role: "user",
		content: [{ type: "input_text", text }],
		metadata: {
			id: `review:${crypto.randomUUID()}`,
			source: "app",
			sender: "app",
			channel: "review",
			timestamp: Math.floor(Date.now() / 1000),
		},
	});
}
