import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

const ORIGIN = 'https://mcp-afp.manalejandro.com';

function modernRequest(
	method: string,
	params: Record<string, unknown> = {},
	options: { headers?: Record<string, string>; version?: string; id?: number | string } = {},
): Request {
	const version = options.version ?? '2026-07-28';
	const body = {
		jsonrpc: '2.0',
		id: options.id ?? 1,
		method,
		params: {
			...params,
			_meta: {
				'io.modelcontextprotocol/protocolVersion': version,
				'io.modelcontextprotocol/clientCapabilities': {},
			},
		},
	};
	return new Request(`${ORIGIN}/mcp`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Accept: 'application/json, text/event-stream',
			'MCP-Protocol-Version': version,
			'Mcp-Method': method,
			...(params.name ? { 'Mcp-Name': String(params.name) } : {}),
			...(options.headers ?? {}),
		},
		body: JSON.stringify(body),
	});
}

function legacyRequest(method: string, params: Record<string, unknown> = {}, id: number | string | null = 1): Request {
	return new Request(`${ORIGIN}/mcp`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
		body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
	});
}

describe('pages', () => {
	it('serves the index with the catalog counts', async () => {
		const response = await SELF.fetch(`${ORIGIN}/`);
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toContain('text/html');
		const html = await response.text();
		expect(html).toContain('Spanish public data');
		expect(html).toContain('search_catalog');
		expect(html).toContain('102');
	});

	it('serves health as JSON', async () => {
		const response = await SELF.fetch(`${ORIGIN}/health`);
		expect(response.status).toBe(200);
		const body = (await response.json()) as Record<string, any>;
		expect(body.status).toBe('ok');
		expect(body.catalog.sources).toBe(102);
		expect(body.protocol.modern).toBe('2026-07-28');
	});

	it('serves a source page and its JSON record', async () => {
		const page = await SELF.fetch(`${ORIGIN}/sources/ine-api-tempus`);
		expect(page.status).toBe(200);
		expect(await page.text()).toContain('INE');

		const record = await SELF.fetch(`${ORIGIN}/sources/ine-api-tempus.json`);
		expect(record.status).toBe(200);
		const body = (await record.json()) as Record<string, any>;
		expect(body.type).toBe('source');
		expect(body.id).toBe('ine-api-tempus');
	});

	it('serves the agent documents and discovery files', async () => {
		const llms = await SELF.fetch(`${ORIGIN}/llms.txt`);
		expect(llms.status).toBe(200);
		expect(await llms.text()).toContain('Administración fuentes públicas');

		const min = await SELF.fetch(`${ORIGIN}/llms-min.txt`);
		expect(min.status).toBe(200);

		const robots = await SELF.fetch(`${ORIGIN}/robots.txt`);
		expect(await robots.text()).toContain('Sitemap:');

		const sitemap = await SELF.fetch(`${ORIGIN}/sitemap.xml`);
		expect(await sitemap.text()).toContain('<urlset');
	});

	it('returns a 404 page for unknown paths', async () => {
		const response = await SELF.fetch(`${ORIGIN}/does-not-exist`);
		expect(response.status).toBe(404);
		expect(await response.text()).toContain('Not found');
	});
});

describe('modern MCP transport', () => {
	it('answers server/discover', async () => {
		const response = await SELF.fetch(modernRequest('server/discover'));
		expect(response.status).toBe(200);
		const body = (await response.json()) as Record<string, any>;
		expect(body.result.resultType).toBe('complete');
		expect(body.result.supportedVersions).toContain('2026-07-28');
		expect(body.result._meta['io.modelcontextprotocol/serverInfo'].name).toBe('administracion-fuentes-publicas');
	});

	it('lists the eight tools', async () => {
		const response = await SELF.fetch(modernRequest('tools/list'));
		const body = (await response.json()) as Record<string, any>;
		const names = body.result.tools.map((tool: { name: string }) => tool.name);
		expect(names).toHaveLength(8);
		expect(names).toContain('search_catalog');
		expect(names).toContain('find_dead_route');
	});

	it('searches the catalog', async () => {
		const response = await SELF.fetch(modernRequest('tools/call', { name: 'search_catalog', arguments: { query: 'paro municipio' } }));
		const body = (await response.json()) as Record<string, any>;
		expect(body.result.isError).toBe(false);
		expect(body.result.structuredContent.sources.length).toBeGreaterThan(0);
		expect(body.result.structuredContent.sources[0].id).toBeTruthy();
	});

	it('returns a record with alerts first', async () => {
		const response = await SELF.fetch(modernRequest('tools/call', { name: 'get_record', arguments: { id: 'placsp-datos-abiertos' } }));
		const body = (await response.json()) as Record<string, any>;
		expect(body.result.isError).toBe(false);
		expect(body.result.structuredContent.type).toBe('source');
		expect(body.result.structuredContent.alerts.length).toBeGreaterThan(0);
	});

	it('suggests ids for an unknown record', async () => {
		const response = await SELF.fetch(modernRequest('tools/call', { name: 'get_record', arguments: { id: 'ine-api-tempu' } }));
		const body = (await response.json()) as Record<string, any>;
		expect(body.result.structuredContent.suggestions).toContain('ine-api-tempus');
	});

	it('rejects a missing _meta object', async () => {
		const request = new Request(`${ORIGIN}/mcp`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json, text/event-stream',
				'MCP-Protocol-Version': '2026-07-28',
				'Mcp-Method': 'tools/list',
			},
			body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
		});
		const response = await SELF.fetch(request);
		expect(response.status).toBe(400);
		const body = (await response.json()) as Record<string, any>;
		expect(body.error.code).toBe(-32602);
	});

	it('rejects an unsupported protocol version', async () => {
		const response = await SELF.fetch(modernRequest('tools/list', {}, { version: '2025-03-26' }));
		expect(response.status).toBe(400);
		const body = (await response.json()) as Record<string, any>;
		expect(body.error.code).toBe(-32022);
	});

	it('rejects a header that disagrees with the body', async () => {
		const request = modernRequest('tools/list');
		const broken = new Request(request, { headers: { ...Object.fromEntries(request.headers), 'Mcp-Method': 'tools/call' } });
		const response = await SELF.fetch(broken);
		expect(response.status).toBe(400);
		const body = (await response.json()) as Record<string, any>;
		expect(body.error.code).toBe(-32020);
	});

	it('returns 404 for an unknown method', async () => {
		const response = await SELF.fetch(modernRequest('does/not/exist'));
		expect(response.status).toBe(404);
		const body = (await response.json()) as Record<string, any>;
		expect(body.error.code).toBe(-32601);
	});

	it('rejects a disallowed Origin', async () => {
		const response = await SELF.fetch(modernRequest('tools/list', {}, { headers: { Origin: 'https://evil.example' } }));
		expect(response.status).toBe(403);
	});

	it('rejects GET on /mcp', async () => {
		const response = await SELF.fetch(`${ORIGIN}/mcp`, { headers: { Accept: 'application/json' } });
		expect(response.status).toBe(405);
	});
});

describe('legacy MCP transport', () => {
	it('answers the initialize handshake without resultType', async () => {
		const response = await SELF.fetch(legacyRequest('initialize'));
		expect(response.status).toBe(200);
		const body = (await response.json()) as Record<string, any>;
		expect(body.result.protocolVersion).toBe('2025-11-25');
		expect(body.result.resultType).toBeUndefined();
		expect(body.result.serverInfo.name).toBe('administracion-fuentes-publicas');
	});

	it('serves tools/list', async () => {
		const response = await SELF.fetch(legacyRequest('tools/list'));
		const body = (await response.json()) as Record<string, any>;
		expect(body.result.tools).toHaveLength(8);
	});

	it('returns 202 for notifications', async () => {
		const response = await SELF.fetch(legacyRequest('notifications/initialized', {}, null));
		expect(response.status).toBe(202);
	});

	it('opens an SSE stream with the message endpoint', async () => {
		const response = await SELF.fetch(`${ORIGIN}/sse`, { headers: { Accept: 'text/event-stream' } });
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toContain('text/event-stream');
		const reader = response.body!.getReader();
		const { value } = await reader.read();
		const first = new TextDecoder().decode(value);
		expect(first).toContain('event: endpoint');
		expect(first).toContain('/messages?sessionId=');
		await reader.cancel();
	});

	it('rejects messages for a session that is not connected', async () => {
		const response = await SELF.fetch(`${ORIGIN}/messages?sessionId=missing`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
			body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
		});
		expect(response.status).toBe(409);
	});

	it('requires a sessionId on /messages', async () => {
		const response = await SELF.fetch(`${ORIGIN}/messages`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
			body: '{}',
		});
		expect(response.status).toBe(400);
	});
});
