/** Minimal client for the Ampersand Agents API (https://ampersand.humansand.ai/docs/) */

const BASE_URL =
	process.env.AMPERSAND_BASE_URL || "https://ampersand.humansand.ai/v1";
export const AMPERSAND_MODEL = process.env.AMPERSAND_MODEL || "ampersand-v0.1";

export interface FunctionTool {
	type: "function";
	name: string;
	description: string;
	parameters: Record<string, unknown>;
}

export interface InputMessage {
	role: "user";
	content: { type: "input_text"; text: string }[];
	metadata?: Record<string, string | number>;
}

export interface RequiredAction {
	turn_id: string;
	call_id: string;
	name: string;
	arguments: Record<string, unknown>;
}

export type SessionInput =
	| { type: "agent.session.input.message"; input: InputMessage[] }
	| {
			type: "agent.session.input.tool_result";
			turn_id: string;
			call_id: string;
			success: boolean;
			output?: string;
			error?: string;
	  }
	| { type: "agent.session.input.cancel" };

export interface SessionEvent {
	type: string;
	session?: {
		id: string;
		error?: string | null;
		required_actions?: RequiredAction[];
	};
	turn?: { id: string; error?: { code: string; message: string } | null };
	error?: { message: string };
}

export interface SessionCreate {
	agent: { model: string; instructions: string; tools: FunctionTool[] };
	input: InputMessage[];
	metadata?: Record<string, string>;
}

const MAX_ATTEMPTS = 5;

async function request(path: string, init: RequestInit = {}) {
	for (let attempt = 1; ; attempt++) {
		const response = await fetch(`${BASE_URL}${path}`, {
			...init,
			headers: {
				Authorization: `Bearer ${process.env.AMPERSAND_API_KEY}`,
				"OpenAI-Beta": "agents=v1",
				"Content-Type": "application/json",
				...init.headers,
			},
		});
		if (response.ok) return response;
		// Rate-limited requests did no work, so they can be resent as-is (same body and idempotency key)
		if (response.status === 429 && attempt < MAX_ATTEMPTS) {
			const waitMs =
				Number(response.headers.get("retry-after-ms")) ||
				Number(response.headers.get("retry-after")) * 1000 ||
				5000;
			await new Promise((resolve) => setTimeout(resolve, waitMs));
			continue;
		}
		throw new Error(
			`Ampersand ${init.method ?? "GET"} ${path} failed with ${response.status}: ${await response.text()}`,
		);
	}
}

async function* readEvents(response: Response): AsyncGenerator<SessionEvent> {
	if (!response.body) return;
	const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
	let buffer = "";
	try {
		while (true) {
			const { value, done } = await reader.read();
			if (done) return;
			buffer += value.replaceAll("\r\n", "\n");
			for (
				let end = buffer.indexOf("\n\n");
				end !== -1;
				end = buffer.indexOf("\n\n")
			) {
				const data = buffer
					.slice(0, end)
					.split("\n")
					.filter((line) => line.startsWith("data:"))
					.map((line) => line.slice(5).trimStart())
					.join("\n");
				buffer = buffer.slice(end + 2);
				if (data) yield JSON.parse(data);
			}
		}
	} finally {
		await reader.cancel();
	}
}

/** Creates a session with its first message and returns the session's event stream */
export async function createSession(body: SessionCreate, signal: AbortSignal) {
	const response = await request("/agents/sessions", {
		method: "POST",
		body: JSON.stringify({
			...body,
			environment: { type: "none" },
			stream: true,
		}),
		signal,
	});
	return readEvents(response);
}

export async function streamSessionEvents(
	sessionId: string,
	signal: AbortSignal,
) {
	return readEvents(
		await request(`/agents/sessions/${sessionId}/events`, { signal }),
	);
}

export async function sendSessionEvents(
	sessionId: string,
	events: SessionInput[],
	idempotencyKey: string,
) {
	await request(`/agents/sessions/${sessionId}/events`, {
		method: "POST",
		body: JSON.stringify({ events }),
		headers: { "Idempotency-Key": idempotencyKey },
	});
}
