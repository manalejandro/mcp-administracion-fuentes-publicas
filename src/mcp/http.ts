// HTTP transport for the MCP endpoint.
//
// `/mcp` speaks the modern 2026-07-28 Streamable HTTP profile when the request
// carries modern metadata, and the legacy `initialize` profile otherwise.
// `/sse` + `/messages` keep the old HTTP+SSE transport alive through a Durable
// Object so existing clients keep working.

import { dispatch, initializeResult, SUPPORTED_MODERN_VERSIONS, wrapResult, type Era } from './protocol';
import type { AppEnv } from '../env';

const DEFAULT_ORIGIN = 'https://mcp-afp.manalejandro.com';
const MAX_BODY_BYTES = 1_048_576;

const CORS_ALLOW_HEADERS = [
	'Content-Type',
	'Accept',
	'Authorization',
	'MCP-Protocol-Version',
	'Mcp-Method',
	'Mcp-Name',
	'Mcp-Session-Id',
	'Last-Event-ID',
].join(', ');

const CORS_EXPOSE_HEADERS = 'Mcp-Session-Id, MCP-Protocol-Version';

export interface JsonRpcId {
	id: string | number | null;
}

function isAllowedOrigin(origin: string, requestUrl: URL): boolean {
	if (origin === DEFAULT_ORIGIN || origin === requestUrl.origin) return true;
	try {
		const url = new URL(origin);
		if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
		return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1' || url.hostname === '[::1]';
	} catch {
		return false;
	}
}

export function corsHeaders(request: Request): Headers {
	const headers = new Headers();
	const origin = request.headers.get('Origin');
	if (origin) {
		headers.set('Access-Control-Allow-Origin', origin);
		headers.set('Vary', 'Origin');
	}
	headers.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS, DELETE');
	headers.set('Access-Control-Allow-Headers', CORS_ALLOW_HEADERS);
	headers.set('Access-Control-Expose-Headers', CORS_EXPOSE_HEADERS);
	headers.set('Access-Control-Max-Age', '86400');
	return headers;
}

function withCors(response: Response, request: Request): Response {
	const headers = new Headers(response.headers);
	for (const [key, value] of corsHeaders(request)) headers.set(key, value);
	return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function jsonResponse(body: unknown, status: number, request: Request): Response {
	const headers = corsHeaders(request);
	headers.set('Content-Type', 'application/json; charset=utf-8');
	headers.set('Cache-Control', 'no-store');
	headers.set('X-Content-Type-Options', 'nosniff');
	return new Response(JSON.stringify(body), { status, headers });
}

function rpcError(id: string | number | null, code: number, message: string, data?: unknown) {
	return {
		jsonrpc: '2.0',
		id,
		error: { code, message, ...(data === undefined ? {} : { data }) },
	};
}

function decodeHeaderValue(value: string): string {
	if (value.startsWith('=?base64?') && value.endsWith('?=')) {
		const encoded = value.slice('=?base64?'.length, -2);
		try {
			const binary = atob(encoded);
			const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
			return new TextDecoder().decode(bytes);
		} catch {
			return value;
		}
	}
	return value;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function expectedName(method: string, params: Record<string, unknown>): string | undefined {
	switch (method) {
		case 'tools/call':
			return typeof params.name === 'string' ? params.name : undefined;
		case 'resources/read':
			return typeof params.uri === 'string' ? params.uri : undefined;
		case 'prompts/get':
			return typeof params.name === 'string' ? params.name : undefined;
		default:
			return undefined;
	}
}

function validateModernMeta(body: Record<string, unknown>): { ok: true; version: string } | { ok: false; message: string } {
	const params = asRecord(body.params);
	const meta = asRecord(params?._meta);
	if (!meta) return { ok: false, message: 'Missing required params._meta object.' };

	const version = meta['io.modelcontextprotocol/protocolVersion'];
	if (typeof version !== 'string' || version.length === 0) {
		return { ok: false, message: 'Missing required _meta field: io.modelcontextprotocol/protocolVersion.' };
	}

	const capabilities = meta['io.modelcontextprotocol/clientCapabilities'];
	if (!capabilities || typeof capabilities !== 'object' || Array.isArray(capabilities)) {
		return { ok: false, message: 'Missing required _meta field: io.modelcontextprotocol/clientCapabilities (an object, {} is valid).' };
	}

	return { ok: true, version };
}

function validateModernHeaders(
	request: Request,
	body: Record<string, unknown>,
	params: Record<string, unknown>,
	bodyVersion: string,
): string | null {
	const headerVersion = request.headers.get('MCP-Protocol-Version');
	if (!headerVersion) return 'Missing required header: MCP-Protocol-Version.';
	if (headerVersion !== bodyVersion) {
		return `Header mismatch: MCP-Protocol-Version header value '${headerVersion}' does not match body value '${bodyVersion}'.`;
	}

	const method = typeof body.method === 'string' ? body.method : '';
	const headerMethod = request.headers.get('Mcp-Method');
	if (!headerMethod) return 'Missing required header: Mcp-Method.';
	if (headerMethod !== method) {
		return `Header mismatch: Mcp-Method header value '${headerMethod}' does not match body value '${method}'.`;
	}

	const expected = expectedName(method, params);
	if (expected !== undefined) {
		const headerName = request.headers.get('Mcp-Name');
		if (!headerName) return 'Missing required header: Mcp-Name.';
		const decoded = decodeHeaderValue(headerName);
		if (decoded !== expected) {
			return `Header mismatch: Mcp-Name header value '${decoded}' does not match body value '${expected}'.`;
		}
	}

	return null;
}

function prefersEventStream(request: Request): boolean {
	const accept = request.headers.get('Accept') ?? '';
	if (!accept) return false;
	return accept.includes('text/event-stream') && !accept.includes('application/json') && !accept.includes('*/*');
}

function respondsWithJsonOrSse(request: Request): boolean {
	const accept = request.headers.get('Accept') ?? '';
	if (!accept) return true;
	return accept.includes('application/json') || accept.includes('text/event-stream') || accept.includes('*/*');
}

function sseResponse(body: unknown, status: number, request: Request): Response {
	const headers = corsHeaders(request);
	headers.set('Content-Type', 'text/event-stream; charset=utf-8');
	headers.set('Cache-Control', 'no-store');
	headers.set('X-Content-Type-Options', 'nosniff');
	headers.set('Connection', 'keep-alive');
	const payload = `event: message\ndata: ${JSON.stringify(body)}\n\n`;
	return new Response(payload, { status, headers });
}

function sendRpc(body: unknown, status: number, request: Request): Response {
	return prefersEventStream(request) ? sseResponse(body, status, request) : jsonResponse(body, status, request);
}

async function readJsonBody(request: Request): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; response: Response }> {
	const contentLength = Number(request.headers.get('Content-Length') ?? '0');
	if (contentLength > MAX_BODY_BYTES) {
		return {
			ok: false,
			response: jsonResponse(rpcError(null, -32600, 'Request body is too large (limit 1 MiB).'), 413, request),
		};
	}

	const text = await request.text();
	if (text.length > MAX_BODY_BYTES) {
		return {
			ok: false,
			response: jsonResponse(rpcError(null, -32600, 'Request body is too large (limit 1 MiB).'), 413, request),
		};
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return { ok: false, response: jsonResponse(rpcError(null, -32700, 'Parse error: the body is not valid JSON.'), 400, request) };
	}

	if (Array.isArray(parsed)) {
		return {
			ok: false,
			response: jsonResponse(rpcError(null, -32600, 'Batch requests are not supported; send one JSON-RPC message per POST.'), 400, request),
		};
	}

	const body = asRecord(parsed);
	if (!body || body.jsonrpc !== '2.0' || typeof body.method !== 'string') {
		return {
			ok: false,
			response: jsonResponse(rpcError(null, -32600, 'Invalid Request: expected a JSON-RPC 2.0 message with a method.'), 400, request),
		};
	}

	return { ok: true, body };
}

function idOf(body: Record<string, unknown>): string | number | null {
	const id = body.id;
	return typeof id === 'string' || typeof id === 'number' ? id : null;
}

function isNotification(body: Record<string, unknown>): boolean {
	return body.id === undefined || body.id === null;
}

function looksModern(request: Request, body: Record<string, unknown>): boolean {
	if (request.headers.has('MCP-Protocol-Version')) return true;
	const params = asRecord(body.params);
	const meta = asRecord(params?._meta);
	return typeof meta?.['io.modelcontextprotocol/protocolVersion'] === 'string';
}

function handleModern(request: Request, body: Record<string, unknown>): Response {
	const id = idOf(body);

	if (isNotification(body)) {
		// This revision defines no client-to-server notifications over Streamable
		// HTTP. Closing the response stream is cancellation; accept and move on.
		return new Response(null, { status: 202, headers: corsHeaders(request) });
	}

	const metaCheck = validateModernMeta(body);
	if (!metaCheck.ok) {
		return jsonResponse(rpcError(id, -32602, metaCheck.message), 400, request);
	}

	if (!SUPPORTED_MODERN_VERSIONS.includes(metaCheck.version)) {
		return jsonResponse(
			rpcError(id, -32022, 'Unsupported protocol version.', {
				supported: SUPPORTED_MODERN_VERSIONS,
				requested: metaCheck.version,
			}),
			400,
			request,
		);
	}

	const params = asRecord(body.params) ?? {};
	const headerError = validateModernHeaders(request, body, params, metaCheck.version);
	if (headerError) {
		return jsonResponse(rpcError(id, -32020, headerError), 400, request);
	}

	// The 2026-07-28 revision replaced the initialize handshake with
	// server/discover. Answering it here with a 2025 version would be a lie.
	if (body.method === 'initialize') {
		return jsonResponse(rpcError(id, -32601, 'Method not found: initialize. Use server/discover in this protocol version.'), 404, request);
	}

	const outcome = dispatch(body.method as string, params);
	if (outcome.kind === 'error') {
		return sendRpc(
			rpcError(id, outcome.code, outcome.message, outcome.data),
			outcome.httpStatus,
			request,
		);
	}

	return sendRpc({ jsonrpc: '2.0', id, result: wrapResult(outcome.result, 'modern') }, 200, request);
}

function handleLegacy(request: Request, body: Record<string, unknown>): Response {
	const id = idOf(body);

	if (isNotification(body)) {
		return new Response(null, { status: 202, headers: corsHeaders(request) });
	}

	const params = asRecord(body.params) ?? {};
	const outcome = dispatch(body.method as string, params);
	if (outcome.kind === 'error') {
		return sendRpc(rpcError(id, outcome.code, outcome.message, outcome.data), outcome.httpStatus, request);
	}

	const result = body.method === 'initialize' ? initializeResult() : outcome.result;
	return sendRpc({ jsonrpc: '2.0', id, result: wrapResult(result, 'legacy') }, 200, request);
}

/** Handle POST /mcp (and OPTIONS /mcp). */
export async function handleMcpRequest(request: Request, _env: AppEnv): Promise<Response> {
	const origin = request.headers.get('Origin');
	if (origin && !isAllowedOrigin(origin, new URL(request.url))) {
		return jsonResponse(rpcError(null, -32600, 'Forbidden: Origin is not allowed.'), 403, request);
	}

	if (request.method === 'OPTIONS') {
		return new Response(null, { status: 204, headers: corsHeaders(request) });
	}

	if (request.method !== 'POST') {
		const headers = corsHeaders(request);
		headers.set('Allow', 'POST, OPTIONS');
		headers.set('Content-Type', 'application/json; charset=utf-8');
		return new Response(
			JSON.stringify(rpcError(null, -32600, 'Method not allowed. The MCP endpoint accepts POST.')),
			{ status: 405, headers },
		);
	}

	if (!respondsWithJsonOrSse(request)) {
		return jsonResponse(rpcError(null, -32600, 'Not Acceptable: send Accept: application/json, text/event-stream.'), 406, request);
	}

	const read = await readJsonBody(request);
	if (!read.ok) return read.response;

	const modern = looksModern(request, read.body);
	const response = modern ? handleModern(request, read.body) : handleLegacy(request, read.body);
	return response;
}

function sessionStub(env: AppEnv, sessionId: string) {
	return env.SSE_SESSION.getByName(sessionId);
}

/** GET /sse — legacy HTTP+SSE transport (protocol 2024-11-05). */
export async function handleSseRequest(request: Request, env: AppEnv): Promise<Response> {
	const origin = request.headers.get('Origin');
	if (origin && !isAllowedOrigin(origin, new URL(request.url))) {
		return jsonResponse(rpcError(null, -32600, 'Forbidden: Origin is not allowed.'), 403, request);
	}

	if (request.method === 'OPTIONS') {
		return new Response(null, { status: 204, headers: corsHeaders(request) });
	}

	if (request.method !== 'GET') {
		const headers = corsHeaders(request);
		headers.set('Allow', 'GET, OPTIONS');
		return new Response(JSON.stringify(rpcError(null, -32600, 'Method not allowed. Use GET for SSE.')), {
			status: 405,
			headers,
		});
	}

	const sessionId = crypto.randomUUID();
	const stub = sessionStub(env, sessionId);
	const url = new URL('https://sse.internal/sse');
	url.searchParams.set('sessionId', sessionId);
	const upstream = await stub.fetch(new Request(url.toString(), { method: 'GET', headers: request.headers }));
	return withCors(upstream, request);
}

/** POST /messages?sessionId=... — legacy SSE message endpoint. */
export async function handleMessagesRequest(request: Request, env: AppEnv): Promise<Response> {
	const origin = request.headers.get('Origin');
	if (origin && !isAllowedOrigin(origin, new URL(request.url))) {
		return jsonResponse(rpcError(null, -32600, 'Forbidden: Origin is not allowed.'), 403, request);
	}

	if (request.method === 'OPTIONS') {
		return new Response(null, { status: 204, headers: corsHeaders(request) });
	}

	if (request.method !== 'POST') {
		const headers = corsHeaders(request);
		headers.set('Allow', 'POST, OPTIONS');
		return new Response(JSON.stringify(rpcError(null, -32600, 'Method not allowed. Use POST for messages.')), {
			status: 405,
			headers,
		});
	}

	const sessionId = new URL(request.url).searchParams.get('sessionId');
	if (!sessionId) {
		return jsonResponse(rpcError(null, -32602, 'Missing sessionId query parameter. Connect to /sse first.'), 400, request);
	}

	if (!respondsWithJsonOrSse(request)) {
		return jsonResponse(rpcError(null, -32600, 'Not Acceptable: send Accept: application/json, text/event-stream.'), 406, request);
	}

	const body = await request.text();
	if (body.length > MAX_BODY_BYTES) {
		return jsonResponse(rpcError(null, -32600, 'Request body is too large (limit 1 MiB).'), 413, request);
	}

	const stub = sessionStub(env, sessionId);
	const url = new URL('https://sse.internal/message');
	const upstream = await stub.fetch(
		new Request(url.toString(), {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body,
		}),
	);
	return withCors(upstream, request);
}

export type { Era };
