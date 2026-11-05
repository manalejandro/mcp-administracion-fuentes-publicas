// MCP tools exposed by the server. Every tool is read-only and works entirely
// from the bundled catalog: the server never fetches third-party URLs.

import {
	findDeadRoute,
	getCodes,
	getRecord,
	listIdentifiers,
	listProducts,
	listRecipes,
	listSources,
	searchCatalog,
	SECTORS,
} from './catalog';

export interface JsonSchemaProperty {
	type: 'string' | 'number' | 'integer' | 'boolean';
	description?: string;
	enum?: string[];
	minimum?: number;
	maximum?: number;
	default?: string | number | boolean;
}

export interface JsonSchema {
	type: 'object';
	properties: Record<string, JsonSchemaProperty>;
	required?: string[];
	additionalProperties?: boolean;
}

export interface ToolAnnotations {
	title?: string;
	readOnlyHint?: boolean;
	destructiveHint?: boolean;
	idempotentHint?: boolean;
	openWorldHint?: boolean;
}

export interface ToolDefinition {
	name: string;
	title: string;
	description: string;
	inputSchema: JsonSchema;
	annotations: ToolAnnotations;
	handler: (args: Record<string, unknown>) => unknown;
}

const SECTOR_IDS = Object.keys(SECTORS);

const LIMIT = (maximum: number, defaultValue: number, description: string): JsonSchemaProperty => ({
	type: 'integer',
	minimum: 1,
	maximum,
	default: defaultValue,
	description,
});

const SECTOR: JsonSchemaProperty = {
	type: 'string',
	enum: SECTOR_IDS,
	description: 'Filter by sector id. Use list_sources to discover sector ids and labels.',
};

const LEVEL: JsonSchemaProperty = {
	type: 'string',
	enum: ['age', 'ccaa', 'local'],
	description: 'Administrative level: age (central government), ccaa (regional) or local.',
};

const STATUS: JsonSchemaProperty = {
	type: 'string',
	enum: ['active', 'degraded', 'unknown'],
	description: 'Verification status of the source.',
};

const ACCESS: JsonSchemaProperty = {
	type: 'string',
	enum: ['download', 'portal', 'api-rest', 'ogc', 'feed', 'scraping', 'oai-pmh', 'sparql', 'api-soap'],
	description: 'How the data is accessed.',
};

const FORMAT: JsonSchemaProperty = {
	type: 'string',
	description: 'File format, for example csv, json, xlsx, xml, geojson or pdf.',
};

export interface ValidationResult {
	ok: boolean;
	value: Record<string, unknown>;
	errors: string[];
}

/** Validate a subset of JSON Schema: object, required, scalar types, enums and ranges. */
export function validateArguments(schema: JsonSchema, input: unknown): ValidationResult {
	const errors: string[] = [];
	if (!input || typeof input !== 'object' || Array.isArray(input)) {
		return { ok: false, value: {}, errors: ['arguments must be a JSON object'] };
	}
	const args = input as Record<string, unknown>;
	const value: Record<string, unknown> = {};

	for (const key of schema.required ?? []) {
		if (args[key] === undefined || args[key] === null) errors.push(`missing required argument "${key}"`);
	}

	for (const [key, property] of Object.entries(schema.properties)) {
		let current = args[key];
		if (current === undefined || current === null) {
			if (property.default !== undefined) value[key] = property.default;
			continue;
		}

		if (property.type === 'string') {
			if (typeof current !== 'string') {
				errors.push(`"${key}" must be a string`);
				continue;
			}
			const text = current.trim();
			if (property.enum && !property.enum.includes(text)) {
				errors.push(`"${key}" must be one of: ${property.enum.join(', ')}`);
				continue;
			}
			if (text === '' && (schema.required ?? []).includes(key)) {
				errors.push(`"${key}" must not be empty`);
				continue;
			}
			current = text;
		} else if (property.type === 'integer') {
			if (typeof current !== 'number' || !Number.isInteger(current)) {
				errors.push(`"${key}" must be an integer`);
				continue;
			}
			if (property.minimum !== undefined && current < property.minimum) {
				errors.push(`"${key}" must be >= ${property.minimum}`);
				continue;
			}
			if (property.maximum !== undefined && current > property.maximum) {
				errors.push(`"${key}" must be <= ${property.maximum}`);
				continue;
			}
		} else if (property.type === 'number') {
			if (typeof current !== 'number' || !Number.isFinite(current)) {
				errors.push(`"${key}" must be a number`);
				continue;
			}
		} else if (property.type === 'boolean') {
			if (typeof current !== 'boolean') {
				errors.push(`"${key}" must be a boolean`);
				continue;
			}
		}

		value[key] = current;
	}

	return { ok: errors.length === 0, value, errors };
}

function textArg(args: Record<string, unknown>, key: string): string | undefined {
	const value = args[key];
	return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function intArg(args: Record<string, unknown>, key: string, fallback: number): number {
	const value = args[key];
	return typeof value === 'number' ? value : fallback;
}

export const TOOLS: ToolDefinition[] = [
	{
		name: 'search_catalog',
		title: 'Search the Spanish public data catalog',
		description:
			'Search sources, recipes, buildable products, information needs and identifiers at the same time. ' +
			'Returns a light index: use get_record with any returned id for endpoints, examples, verified quirks and alerts. ' +
			'Queries may be in English or Spanish; catalog content is in Spanish.',
		inputSchema: {
			type: 'object',
			properties: {
				query: {
					type: 'string',
					description: 'What you need, for example "unemployment by municipality", "fuel prices" or "contratación menor".',
				},
				sector: SECTOR,
				level: LEVEL,
				status: STATUS,
				access: ACCESS,
				format: FORMAT,
				limit: LIMIT(50, 5, 'Maximum number of source results (1-50).'),
			},
			required: ['query'],
			additionalProperties: false,
		},
		annotations: { title: 'Search catalog', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
		handler(args) {
			return searchCatalog({
				query: textArg(args, 'query') ?? '',
				sector: textArg(args, 'sector'),
				level: textArg(args, 'level'),
				status: textArg(args, 'status'),
				access: textArg(args, 'access'),
				format: textArg(args, 'format'),
				limit: intArg(args, 'limit', 5),
			});
		},
	},
	{
		name: 'get_record',
		title: 'Get a catalog record',
		description:
			'Get the full record for any id returned by search_catalog or any list tool: a source (endpoints, alerts, code, ' +
			'quirks, gotchas, sync notes), a recipe (ordered steps), a product (pieces, freshness, licence, pitfalls), ' +
			'an identifier (format, regex, joins) or a code group. Returns similar ids when the id does not exist.',
		inputSchema: {
			type: 'object',
			properties: {
				id: {
					type: 'string',
					description: 'Record id, for example "ine-api-tempus", "ipc-ultimo-dato" or "ine-municipio".',
				},
			},
			required: ['id'],
			additionalProperties: false,
		},
		annotations: { title: 'Get record', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
		handler(args) {
			return getRecord(textArg(args, 'id') ?? '');
		},
	},
	{
		name: 'list_sources',
		title: 'List data sources',
		description:
			'List catalog sources with optional filters. Use it to browse sectors, find every source at a given ' +
			'administrative level, or discover which sources publish a format. Results are compact; call get_record for detail.',
		inputSchema: {
			type: 'object',
			properties: {
				query: { type: 'string', description: 'Optional free-text filter applied before listing.' },
				sector: SECTOR,
				level: LEVEL,
				status: STATUS,
				access: ACCESS,
				format: FORMAT,
				limit: LIMIT(100, 25, 'Maximum number of sources to return (1-100).'),
				offset: {
					type: 'integer',
					minimum: 0,
					maximum: 1000,
					default: 0,
					description: 'Number of matching sources to skip, for pagination.',
				},
			},
			additionalProperties: false,
		},
		annotations: { title: 'List sources', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
		handler(args) {
			return listSources({
				query: textArg(args, 'query'),
				sector: textArg(args, 'sector'),
				level: textArg(args, 'level'),
				status: textArg(args, 'status'),
				access: textArg(args, 'access'),
				format: textArg(args, 'format'),
				limit: intArg(args, 'limit', 25),
				offset: intArg(args, 'offset', 0),
			});
		},
	},
	{
		name: 'list_products',
		title: 'List buildable products',
		description:
			'List the data products that can be built from the catalog, with the sources and recipes each one needs, ' +
			'their freshness, volume, licence and the main pitfall. Use it to choose a product before wiring anything.',
		inputSchema: {
			type: 'object',
			properties: {
				query: { type: 'string', description: 'Optional free-text filter over product name, audience and pieces.' },
				limit: LIMIT(50, 50, 'Maximum number of products to return (1-50).'),
			},
			additionalProperties: false,
		},
		annotations: { title: 'List products', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
		handler(args) {
			return listProducts(textArg(args, 'query'), intArg(args, 'limit', 50));
		},
	},
	{
		name: 'list_recipes',
		title: 'List recipes',
		description:
			'List recipes that combine one or more sources for a concrete intent, for example the latest CPI or new ' +
			'procurement notices. Each recipe lists its sources and output; get_record returns the ordered steps and checks.',
		inputSchema: {
			type: 'object',
			properties: {
				query: { type: 'string', description: 'Optional free-text filter over intent, steps and output.' },
				source: { type: 'string', description: 'Only recipes that use this source id.' },
				limit: LIMIT(50, 50, 'Maximum number of recipes to return (1-50).'),
			},
			additionalProperties: false,
		},
		annotations: { title: 'List recipes', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
		handler(args) {
			return listRecipes(textArg(args, 'query'), textArg(args, 'source'), intArg(args, 'limit', 50));
		},
	},
	{
		name: 'get_codes',
		title: 'Get API code lists',
		description:
			'Get code lists that an API requires and nobody can guess: INE operation and variable ids, DataComex countries, ' +
			'AEMET stations, fuel product codes, BOE sections and ranges. Call without a group to list groups; with a group ' +
			'to list its entries. Filter entries with query.',
		inputSchema: {
			type: 'object',
			properties: {
				group: { type: 'string', description: 'Code group id, for example "ine-operaciones" or "boe-secciones".' },
				query: { type: 'string', description: 'Filter entries by code, name or note.' },
				limit: LIMIT(500, 50, 'Maximum number of entries to return (1-500).'),
			},
			additionalProperties: false,
		},
		annotations: { title: 'Get codes', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
		handler(args) {
			return getCodes({
				group: textArg(args, 'group'),
				query: textArg(args, 'query'),
				limit: intArg(args, 'limit', 50),
			});
		},
	},
	{
		name: 'find_dead_route',
		title: 'Find a dead or moved route',
		description:
			'Check whether a remembered URL is a known dead route, and get its replacement. Matches exact URLs and prefixes ' +
			'in both directions. Also filter by source id or status to see every dead route for a source before trusting an old link.',
		inputSchema: {
			type: 'object',
			properties: {
				url: { type: 'string', description: 'URL to check, with or without a trailing slash.' },
				source: { type: 'string', description: 'Only dead routes recorded for this source id.' },
				status: { type: 'string', description: 'Filter by recorded status, for example redirect, 404, 403, blocked or dns.' },
				limit: LIMIT(99, 25, 'Maximum number of routes to return (1-99).'),
			},
			additionalProperties: false,
		},
		annotations: { title: 'Find dead route', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
		handler(args) {
			return findDeadRoute({
				url: textArg(args, 'url'),
				source: textArg(args, 'source'),
				status: textArg(args, 'status'),
				limit: intArg(args, 'limit', 25),
			});
		},
	},
	{
		name: 'list_identifiers',
		title: 'List identifiers and join keys',
		description:
			'List the identifiers used across Spanish public data (INE municipality, province, NUTS, cadastral reference, ' +
			'NIF, DIR3, CPV, CNAE, BOE id, ELI, CN medicine, and more) with format, regex, example and known pitfalls. ' +
			'Use get_record on an identifier to see how it joins to other sources.',
		inputSchema: {
			type: 'object',
			properties: {
				query: { type: 'string', description: 'Optional free-text filter over identifier id, format and issuer.' },
				limit: LIMIT(50, 50, 'Maximum number of identifiers to return (1-50).'),
			},
			additionalProperties: false,
		},
		annotations: { title: 'List identifiers', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
		handler(args) {
			return listIdentifiers(textArg(args, 'query'), intArg(args, 'limit', 50));
		},
	},
];

export const TOOL_BY_NAME = new Map(TOOLS.map((tool) => [tool.name, tool]));

export interface ToolCallResult {
	content: Array<{ type: 'text'; text: string }>;
	structuredContent: Record<string, unknown>;
	isError: boolean;
}

export function callTool(name: string, args: unknown): { found: true; result: ToolCallResult } | { found: false } {
	const tool = TOOL_BY_NAME.get(name);
	if (!tool) return { found: false };

	const validation = validateArguments(tool.inputSchema, args);
	if (!validation.ok) {
		return {
			found: true,
			result: {
				content: [{ type: 'text', text: JSON.stringify({ error: 'Invalid arguments', details: validation.errors }, null, 2) }],
				structuredContent: { error: 'Invalid arguments', details: validation.errors },
				isError: true,
			},
		};
	}

	const output = tool.handler(validation.value);
	const structured = output as Record<string, unknown>;
	return {
		found: true,
		result: {
			content: [{ type: 'text', text: JSON.stringify(output) }],
			structuredContent: structured,
			isError: false,
		},
	};
}
