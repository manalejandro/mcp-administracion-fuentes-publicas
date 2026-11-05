// Worker entry point: routes HTML pages, machine-readable documents and the
// two MCP transports from a single Worker.

import { llms, llmsMin } from './data/llms';
import { CATALOG, getRecord, searchCatalog, SOURCE_BY_ID, RECIPE_BY_ID } from './mcp/catalog';
import { handleMcpRequest, handleMessagesRequest, handleSseRequest } from './mcp/http';
import type { AppEnv } from './env';
import {
	faviconSvg,
	healthPayload,
	identifiersPage,
	indexPage,
	notFoundPage,
	productsPage,
	recipePage,
	recipesPage,
	robotsTxt,
	searchPage,
	sitemapXml,
	sourceJson,
	sourcePage,
	sourcesPage,
} from './pages';

export { SseSession } from './mcp/sse-session';

// Serialising the full catalog per request would be wasteful: do it once at
// module init and reuse the same string.
const CATALOG_JSON = JSON.stringify(CATALOG);

const HTML_HEADERS = {
	'Content-Type': 'text/html; charset=utf-8',
	'Cache-Control': 'public, max-age=300',
	'X-Content-Type-Options': 'nosniff',
	'Referrer-Policy': 'strict-origin-when-cross-origin',
};

const TEXT_HEADERS = {
	'Content-Type': 'text/plain; charset=utf-8',
	'Cache-Control': 'public, max-age=300',
	'X-Content-Type-Options': 'nosniff',
};

const JSON_HEADERS = {
	'Content-Type': 'application/json; charset=utf-8',
	'Cache-Control': 'public, max-age=60',
	'X-Content-Type-Options': 'nosniff',
};

function html(body: string, status = 200): Response {
	return new Response(body, { status, headers: HTML_HEADERS });
}

function text(body: string, status = 200): Response {
	return new Response(body, { status, headers: TEXT_HEADERS });
}

function json(body: unknown, status = 200): Response {
	return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function normalizePath(pathname: string): string {
	const trimmed = pathname.replace(/\/+$/, '');
	return trimmed === '' ? '/' : trimmed;
}

export default {
	async fetch(request: Request, env: AppEnv): Promise<Response> {
		const url = new URL(request.url);
		const path = normalizePath(url.pathname);

		if (request.method === 'OPTIONS') {
			return new Response(null, {
				status: 204,
				headers: {
					'Access-Control-Allow-Origin': request.headers.get('Origin') ?? '*',
					'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE',
					'Access-Control-Allow-Headers':
						'Content-Type, Accept, Authorization, MCP-Protocol-Version, Mcp-Method, Mcp-Name, Mcp-Session-Id, Last-Event-ID',
					'Access-Control-Max-Age': '86400',
					Vary: 'Origin',
				},
			});
		}

		if (path === '/mcp') return handleMcpRequest(request, env);
		if (path === '/sse') return handleSseRequest(request, env);
		if (path === '/messages') return handleMessagesRequest(request, env);

		if (request.method !== 'GET' && request.method !== 'HEAD') {
			return json({ error: 'Method not allowed.' }, 405);
		}

		switch (path) {
			case '/':
				return html(indexPage());

			case '/health':
				return json(healthPayload());

			case '/catalog.json':
				return json(CATALOG_JSON);

			case '/llms.txt':
				return text(llms);

			case '/llms-min.txt':
				return text(llmsMin);

			case '/robots.txt':
				return text(robotsTxt());

			case '/sitemap.xml':
				return new Response(sitemapXml(), {
					headers: {
						'Content-Type': 'application/xml; charset=utf-8',
						'Cache-Control': 'public, max-age=3600',
					},
				});

			case '/favicon.svg':
				return new Response(faviconSvg(), {
					headers: {
						'Content-Type': 'image/svg+xml',
						'Cache-Control': 'public, max-age=86400',
					},
				});

			case '/search':
				return html(searchPage(url.searchParams.get('q') ?? '', url.searchParams.get('sector') ?? ''));

			case '/sources':
				return html(
					sourcesPage({
						sector: url.searchParams.get('sector') ?? undefined,
						level: url.searchParams.get('level') ?? undefined,
						status: url.searchParams.get('status') ?? undefined,
						format: url.searchParams.get('format') ?? undefined,
						query: url.searchParams.get('q') ?? undefined,
					}),
				);

			case '/products':
				return html(productsPage());

			case '/recipes':
				return html(recipesPage());

			case '/identifiers':
				return html(identifiersPage());
		}

		if (path.startsWith('/sources/')) {
			const rest = path.slice('/sources/'.length);
			const wantsJson = rest.endsWith('.json');
			const id = decodeURIComponent(wantsJson ? rest.slice(0, -'.json'.length) : rest);
			const source = SOURCE_BY_ID.get(id);
			if (!source) return html(notFoundPage(path), 404);
			return wantsJson ? json(sourceJson(source)) : html(sourcePage(source));
		}

		if (path.startsWith('/recipes/')) {
			const id = decodeURIComponent(path.slice('/recipes/'.length));
			const recipe = RECIPE_BY_ID.get(id);
			if (!recipe) return html(notFoundPage(path), 404);
			return html(recipePage(recipe));
		}

		// A convenience for agents: `/record/:id.json` returns any record kind.
		if (path.startsWith('/record/')) {
			const id = decodeURIComponent(path.slice('/record/'.length).replace(/\.json$/, ''));
			const record = getRecord(id);
			if ('error' in record && record.error) return json(record, 404);
			return json(JSON.stringify(record));
		}

		const accepts = request.headers.get('Accept') ?? '';
		if (accepts.includes('application/json')) {
			return json({ error: 'Not found', path }, 404);
		}
		return html(notFoundPage(path), 404);
	},
} satisfies ExportedHandler<AppEnv>;
