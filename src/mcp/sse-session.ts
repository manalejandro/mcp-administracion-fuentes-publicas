// Durable Object backing the legacy HTTP+SSE transport (protocol 2024-11-05).
//
// One instance per session id. GET /sse opens a long-lived SSE stream and the
// first event tells the client where to POST messages. POST /message dispatches
// each message and writes its JSON-RPC response back over the same stream.

import type { AppEnv } from '../env';
import { dispatch, initializeResult, wrapResult } from './protocol';

const KEEPALIVE_MS = 25_000;

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

export class SseSession implements DurableObject {
	private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
	private encoder = new TextEncoder();
	private closed = false;

	constructor(
		private state: DurableObjectState,
		private env: AppEnv,
	) {}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === '/sse') return this.openStream(url);
		if (url.pathname === '/message') return this.receive(request);
		if (url.pathname === '/close') {
			await this.close();
			return new Response('closed', { status: 200 });
		}

		return new Response('Not found', { status: 404 });
	}

	private async openStream(url: URL): Promise<Response> {
		// One stream per session: replace a previous connection instead of
		// leaking writers.
		await this.close();
		this.closed = false;

		const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
		this.writer = writable.getWriter();

		const sessionId = url.searchParams.get('sessionId') ?? '';
		this.write(`event: endpoint\ndata: /messages?sessionId=${encodeURIComponent(sessionId)}\n\n`);

		// Keep proxies from closing an idle stream. The alarm is cancelled when
		// the writer fails or the stream closes.
		await this.state.storage.setAlarm(Date.now() + KEEPALIVE_MS);

		return new Response(readable, {
			status: 200,
			headers: {
				'Content-Type': 'text/event-stream; charset=utf-8',
				'Cache-Control': 'no-store',
				'Connection': 'keep-alive',
				'X-Content-Type-Options': 'nosniff',
			},
		});
	}

	private async receive(request: Request): Promise<Response> {
		if (!this.writer || this.closed) {
			return new Response(JSON.stringify({ error: 'No active SSE session. Reconnect to /sse.' }), {
				status: 409,
				headers: { 'Content-Type': 'application/json; charset=utf-8' },
			});
		}

		let body: Record<string, unknown>;
		let method: string;
		try {
			const parsed = JSON.parse(await request.text());
			const record = asRecord(parsed);
			if (!record || record.jsonrpc !== '2.0' || typeof record.method !== 'string') throw new Error('invalid');
			body = record;
			method = record.method;
		} catch {
			return new Response(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }), {
				status: 400,
				headers: { 'Content-Type': 'application/json; charset=utf-8' },
			});
		}

		// Notifications (including notifications/initialized) have no response.
		if (body.id === undefined || body.id === null) {
			return new Response(null, { status: 202 });
		}

		const id = typeof body.id === 'string' || typeof body.id === 'number' ? body.id : null;
		const params = asRecord(body.params) ?? {};
		const outcome = dispatch(method, params);

		let response: Record<string, unknown>;
		if (outcome.kind === 'error') {
			response = {
				jsonrpc: '2.0',
				id,
				error: { code: outcome.code, message: outcome.message, ...(outcome.data === undefined ? {} : { data: outcome.data }) },
			};
		} else {
			const result = method === 'initialize' ? initializeResult() : outcome.result;
			response = { jsonrpc: '2.0', id, result: wrapResult(result, 'legacy') };
		}

		await this.write(`event: message\ndata: ${JSON.stringify(response)}\n\n`);
		return new Response(null, { status: 202 });
	}

	private async write(chunk: string): Promise<void> {
		if (!this.writer || this.closed) return;
		try {
			await this.writer.write(this.encoder.encode(chunk));
		} catch {
			this.closed = true;
			this.writer = null;
		}
	}

	private async close(): Promise<void> {
		this.closed = true;
		const writer = this.writer;
		this.writer = null;
		if (writer) {
			try {
				await writer.close();
			} catch {
				// The client may already be gone; nothing to do.
			}
		}
	}

	async alarm(): Promise<void> {
		if (!this.writer || this.closed) return;
		await this.write(`: keepalive ${Date.now()}\n\n`);
		if (this.writer && !this.closed) {
			await this.state.storage.setAlarm(Date.now() + KEEPALIVE_MS);
		}
	}
}
