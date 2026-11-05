// MCP protocol semantics, independent of the HTTP transport. The transport
// adds `resultType` and `_meta` for modern (2026-07-28) responses.

import { llms, llmsMin } from '../data/llms';
import {
	CATALOG,
	CODE_GROUPS,
	getCodes,
	getRecord,
	IDENTIFIERS,
	PRODUCT_BY_ID,
	RECIPE_BY_ID,
	SOURCE_BY_ID,
	catalogSummary,
} from './catalog';
import { callTool, TOOLS } from './tools';

export const SERVER_INFO = {
	name: 'administracion-fuentes-publicas',
	title: 'Administración fuentes públicas',
	version: '1.0.0',
};

export const SUPPORTED_MODERN_VERSIONS = ['2026-07-28'];
export const LATEST_LEGACY_VERSION = '2025-11-25';

export type Era = 'modern' | 'legacy';

export const CAPABILITIES = {
	tools: {},
	resources: {},
	prompts: {},
	completions: {},
};

export const INSTRUCTIONS = [
	'Spanish public data catalog: where each dataset lives, how to request it, what it returns, and the verified traps that change a number without raising an error.',
	'Catalog content and ids are in Spanish; tool names, descriptions and this text are in English.',
	'Start with search_catalog for a need. It searches sources, recipes, products, information needs and identifiers at once and returns a light index.',
	'Call get_record with any returned id for the full record. For a source, read alerts first: they describe silent traps. Then read quirks, ids, gotchas, endpoints, sync and rate_limit.',
	'Recipes are ordered, source-by-source procedures for a concrete intent. Products describe what can be built today, with the sources and recipes each one needs.',
	'Use get_codes when an API requires an id that cannot be guessed, and find_dead_route before trusting a remembered URL.',
	'The server is catalog-only. It never fetches third-party URLs and never writes anything; use the endpoints and examples in a record with your own HTTP client.',
].join(' ');

export interface DispatchResult {
	kind: 'result';
	result: Record<string, unknown>;
}

export interface DispatchError {
	kind: 'error';
	code: number;
	message: string;
	data?: unknown;
	httpStatus: number;
}

export type DispatchOutcome = DispatchResult | DispatchError;

function ok(result: Record<string, unknown>): DispatchResult {
	return { kind: 'result', result };
}

function fail(code: number, message: string, httpStatus = 400, data?: unknown): DispatchError {
	return { kind: 'error', code, message, httpStatus, ...(data === undefined ? {} : { data }) };
}

/** Add the modern result fields; legacy responses must not carry `resultType`. */
export function wrapResult(result: Record<string, unknown>, era: Era): Record<string, unknown> {
	if (era === 'legacy') return result;
	const existingMeta =
		result._meta && typeof result._meta === 'object' ? (result._meta as Record<string, unknown>) : undefined;
	return {
		resultType: 'complete',
		...result,
		_meta: {
			...(existingMeta ?? {}),
			'io.modelcontextprotocol/serverInfo': SERVER_INFO,
		},
	};
}

export function discoverResult(): Record<string, unknown> {
	return {
		supportedVersions: SUPPORTED_MODERN_VERSIONS,
		capabilities: CAPABILITIES,
		instructions: INSTRUCTIONS,
		ttlMs: 3_600_000,
		cacheScope: 'public',
	};
}

export function initializeResult(): Record<string, unknown> {
	return {
		protocolVersion: LATEST_LEGACY_VERSION,
		capabilities: CAPABILITIES,
		serverInfo: SERVER_INFO,
		instructions: INSTRUCTIONS,
	};
}

export const STATIC_RESOURCES = [
	{
		uri: 'catalog://overview',
		name: 'Catalog overview',
		title: 'Catalog overview',
		description: 'Counts, sectors, levels, statuses, access types and formats in the catalog.',
		mimeType: 'application/json',
	},
	{
		uri: 'catalog://llms-min',
		name: 'llms-min',
		title: 'Agent quick start (short)',
		description: 'Short agent-facing guide to the catalog: what it is, what can be built and where to start.',
		mimeType: 'text/markdown',
	},
	{
		uri: 'catalog://llms',
		name: 'llms',
		title: 'Agent guide (full)',
		description: 'Full agent-facing guide: rules, silent traps, sources by sector, recipes and cross-cutting guides.',
		mimeType: 'text/markdown',
	},
	{
		uri: 'catalog://rules',
		name: 'rules',
		title: 'Rules before coding against a source',
		description: 'The quick rules section of the agent guide, extracted for a low-token read.',
		mimeType: 'text/markdown',
	},
] as const;

export const RESOURCE_TEMPLATES = [
	{
		uriTemplate: 'catalog://source/{id}',
		name: 'source',
		title: 'Source record',
		description: 'Full source record: alerts, code, endpoints, ids, quirks, gotchas, sync and rate limit.',
		mimeType: 'application/json',
	},
	{
		uriTemplate: 'catalog://recipe/{id}',
		name: 'recipe',
		title: 'Recipe record',
		description: 'Ordered recipe steps, expected output and verification checks.',
		mimeType: 'application/json',
	},
	{
		uriTemplate: 'catalog://product/{id}',
		name: 'product',
		title: 'Product record',
		description: 'A buildable product with its sources, recipes, freshness, volume, licence and pitfall.',
		mimeType: 'application/json',
	},
	{
		uriTemplate: 'catalog://identifier/{id}',
		name: 'identifier',
		title: 'Identifier record',
		description: 'Identifier format, regex, example, issuer, joins and known pitfall.',
		mimeType: 'application/json',
	},
	{
		uriTemplate: 'catalog://codes/{group}',
		name: 'codes',
		title: 'Code list',
		description: 'A code list required by an API, with every code, name and note.',
		mimeType: 'application/json',
	},
] as const;

function rulesMarkdown(): string {
	const start = llms.indexOf('## Reglas rápidas');
	if (start === -1) return llmsMin;
	const end = llms.indexOf('\n## ', start + 5);
	return end === -1 ? llms.slice(start) : llms.slice(start, end);
}

function readResource(uri: string): DispatchOutcome {
	const text = (value: string, mimeType: string) => ok({ contents: [{ uri, mimeType, text: value }] });
	const json = (value: unknown) => text(JSON.stringify(value, null, 2), 'application/json');

	switch (uri) {
		case 'catalog://overview':
			return json(catalogSummary());
		case 'catalog://llms-min':
			return text(llmsMin, 'text/markdown');
		case 'catalog://llms':
			return text(llms, 'text/markdown');
		case 'catalog://rules':
			return text(rulesMarkdown(), 'text/markdown');
	}

	const templates: Array<[string, (id: string) => unknown]> = [
		['catalog://source/', (id) => SOURCE_BY_ID.get(id) ?? { error: `No source with id "${id}".` }],
		['catalog://recipe/', (id) => RECIPE_BY_ID.get(id) ?? { error: `No recipe with id "${id}".` }],
		['catalog://product/', (id) => PRODUCT_BY_ID.get(id) ?? { error: `No product with id "${id}".` }],
		['catalog://identifier/', (id) => (IDENTIFIERS[id] ? { id, ...IDENTIFIERS[id] } : { error: `No identifier with id "${id}".` })],
		['catalog://codes/', (id) => (CODE_GROUPS[id] ? { group: id, ...CODE_GROUPS[id] } : { error: `No code group with id "${id}".` })],
	];

	for (const [prefix, lookup] of templates) {
		if (uri.startsWith(prefix)) {
			const id = decodeURIComponent(uri.slice(prefix.length));
			if (!id) break;
			return json(lookup(id));
		}
	}

	return fail(-32602, `Unknown resource: ${uri}`);
}

export const PROMPTS = [
	{
		name: 'choose_source',
		title: 'Choose a data source',
		description:
			'Pick the best source for a concrete need, with trade-offs, access details, freshness, licence and traps. ' +
			'The catalog is Spanish; the recommendation is in the language of the request.',
		arguments: [
			{ name: 'need', description: 'What data you need and for what decision or product.', required: true },
			{ name: 'constraints', description: 'Optional constraints: budget, licence, geography, update frequency, format.', required: false },
		],
	},
	{
		name: 'build_product',
		title: 'Plan a data product',
		description:
			'Turn an idea into a build plan using the catalog: matching product, sources, recipes, identifiers, ' +
			'freshness, volume and the known pitfalls to handle first.',
		arguments: [
			{ name: 'idea', description: 'The product or analysis you want to build.', required: true },
			{ name: 'constraints', description: 'Optional constraints: audience, budget, stack, geography, refresh cadence.', required: false },
		],
	},
	{
		name: 'audit_source',
		title: 'Audit a source before relying on it',
		description:
			'Audit one source for operational risk: silent alerts, verified gotchas, status, last verification, rate limits, ' +
			'sync strategy, dead routes and identifier joins.',
		arguments: [{ name: 'source_id', description: 'Source id from search_catalog or list_sources.', required: true }],
	},
] as const;

function promptText(name: string, args: Record<string, unknown>): string {
	const constraints =
		typeof args.constraints === 'string' && args.constraints.trim() ? `\nConstraints: ${args.constraints.trim()}` : '';

	if (name === 'choose_source') {
		return [
			'You are choosing a Spanish public data source for a real need.',
			`Need: ${String(args.need ?? '')}${constraints}`,
			'',
			'Work in this order:',
			'1. Call search_catalog with the need, in Spanish if possible, and inspect every candidate id.',
			'2. Call get_record for the strongest candidates. Read alerts before anything else, then quirks, ids, gotchas, endpoints, sync and rate_limit.',
			'3. Check get_codes and find_dead_route when an endpoint needs an id or looks outdated.',
			'4. Rank candidates by fitness for the need, not by number of formats.',
			'',
			'Answer with: the recommended source id and why; access method and auth; formats; update frequency and coverage; licence; the first trap to handle; a runner-up and when to use it; and the exact first request to make.',
		].join('\n');
	}

	if (name === 'build_product') {
		return [
			'You are planning a product built on Spanish public data.',
			`Idea: ${String(args.idea ?? '')}${constraints}`,
			'',
			'Work in this order:',
			'1. Call list_products with a short query and inspect the closest product with get_record.',
			'2. If a product matches, use its sources and recipes as the skeleton. If not, use search_catalog and list_recipes.',
			'3. Read every source record for alerts, quirks and gotchas before designing the pipeline.',
			'4. Use list_identifiers and get_record for every join key, and find_dead_route for every remembered URL.',
			'',
			'Answer with: product scope and audience; sources to use and why; ordered build steps grouped by source; join keys; refresh cadence and freshness assumptions; licence and attribution; the top three traps with mitigations; and what to verify first with a real request.',
		].join('\n');
	}

	if (name === 'audit_source') {
		return [
			`Audit the source "${String(args.source_id ?? '')}" before it is used in production.`,
			'',
			'Work in this order:',
			'1. Call get_record for the source id.',
			'2. Call find_dead_route with the source id to see every recorded dead or moved route.',
			'3. Call get_codes for the groups whose source matches this source, so no required id is guessed.',
			'',
			'Answer with: status and last verification date; access and auth; silent alerts that change results; verified gotchas and quirks; rate limits and bulk-download notes; dead routes with replacements; identifier joins and their pitfalls; and a go / go-with-conditions / no-go verdict with the conditions.',
		].join('\n');
	}

	return `Unknown prompt: ${name}`;
}

function promptMessage(name: string, args: Record<string, unknown>) {
	return {
		description: PROMPTS.find((prompt) => prompt.name === name)?.description,
		messages: [{ role: 'user', content: { type: 'text', text: promptText(name, args) } }],
	};
}

function complete(params: Record<string, unknown>): DispatchOutcome {
	const ref = params.ref as Record<string, unknown> | undefined;
	const argument = params.argument as Record<string, unknown> | undefined;
	const value = typeof argument?.value === 'string' ? argument.value.toLowerCase() : '';

	if (!ref || !argument) return fail(-32602, 'completion/complete requires ref and argument');

	let pool: string[] = [];
	if (ref.type === 'ref/prompt') {
		const prompt = PROMPTS.find((entry) => entry.name === ref.name);
		const arg = prompt?.arguments.find((entry) => entry.name === argument.name);
		if (argument.name === 'source_id') pool = [...SOURCE_BY_ID.keys()];
		else if (arg?.name === 'constraints') pool = [];
	} else if (ref.type === 'ref/resource' && typeof ref.uri === 'string') {
		if (ref.uri.includes('/source/')) pool = [...SOURCE_BY_ID.keys()];
		else if (ref.uri.includes('/recipe/')) pool = [...RECIPE_BY_ID.keys()];
		else if (ref.uri.includes('/product/')) pool = [...PRODUCT_BY_ID.keys()];
		else if (ref.uri.includes('/identifier/')) pool = Object.keys(IDENTIFIERS);
		else if (ref.uri.includes('/codes/')) pool = Object.keys(CODE_GROUPS);
	}

	const values = pool.filter((entry) => entry.toLowerCase().includes(value)).slice(0, 10);
	return ok({ completion: { values, total: values.length, hasMore: false } });
}

export function dispatch(method: string, params: Record<string, unknown>): DispatchOutcome {
	switch (method) {
		case 'server/discover':
			return ok(discoverResult());
		case 'initialize':
			return ok(initializeResult());
		case 'ping':
			return ok({});
		case 'tools/list':
			return ok({
				tools: TOOLS.map((tool) => ({
					name: tool.name,
					title: tool.title,
					description: tool.description,
					inputSchema: tool.inputSchema,
					annotations: tool.annotations,
				})),
			});
		case 'tools/call': {
			const name = typeof params.name === 'string' ? params.name : '';
			if (!name) return fail(-32602, 'tools/call requires params.name');
			const outcome = callTool(name, params.arguments ?? {});
			if (!outcome.found) return fail(-32602, `Unknown tool: ${name}`);
			return ok(outcome.result as unknown as Record<string, unknown>);
		}
		case 'resources/list':
			return ok({
				resources: STATIC_RESOURCES.map((resource) => ({
					uri: resource.uri,
					name: resource.name,
					title: resource.title,
					description: resource.description,
					mimeType: resource.mimeType,
				})),
			});
		case 'resources/templates/list':
			return ok({
				resourceTemplates: RESOURCE_TEMPLATES.map((template) => ({
					uriTemplate: template.uriTemplate,
					name: template.name,
					title: template.title,
					description: template.description,
					mimeType: template.mimeType,
				})),
			});
		case 'resources/read': {
			const uri = typeof params.uri === 'string' ? params.uri : '';
			if (!uri) return fail(-32602, 'resources/read requires params.uri');
			return readResource(uri);
		}
		case 'prompts/list':
			return ok({ prompts: PROMPTS });
		case 'prompts/get': {
			const name = typeof params.name === 'string' ? params.name : '';
			if (!PROMPTS.some((prompt) => prompt.name === name)) return fail(-32602, `Unknown prompt: ${name}`);
			const args = params.arguments && typeof params.arguments === 'object' ? (params.arguments as Record<string, unknown>) : {};
			return ok(promptMessage(name, args));
		}
		case 'completion/complete':
			return complete(params);
		case 'logging/setLevel':
			return ok({});
		default:
			return fail(-32601, `Method not found: ${method}`, 404);
	}
}

export function catalogMetadata() {
	return {
		name: CATALOG.name,
		description: CATALOG.description,
		generated: CATALOG.generated,
		repo: CATALOG.repo,
		count: CATALOG.count,
	};
}
