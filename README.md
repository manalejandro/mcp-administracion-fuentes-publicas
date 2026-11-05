# MCP: Administración fuentes públicas

A remote [Model Context Protocol](https://modelcontextprotocol.io) server for the Spanish public data catalog [**Administración fuentes públicas**](https://github.com/BquantFinance/Administracion-fuentes-publicas).

It answers the question an agent actually has when it needs Spanish public data: *where is this dataset, how do I request it, what does it return, and which silent trap will corrupt my number?* The catalog is data, not documentation: every source carries verified endpoints, formats, update cadence, licence, identifier joins, client quirks, gotchas and alerts.

- 102 sources from central, regional and local government
- 14 buildable data products
- 47 ordered recipes
- 21 identifiers and join keys
- 24 API code lists
- 99 recorded dead or moved routes

Catalog content is in Spanish. Tool names, descriptions and this documentation are in English.

- **Endpoint:** `https://mcp-afp.manalejandro.com/mcp`
- **Legacy SSE:** `https://mcp-afp.manalejandro.com/sse`
- **Human site:** `https://mcp-afp.manalejandro.com/`
- **Agent guide:** `https://mcp-afp.manalejandro.com/llms.txt`

## Connect

### Claude Code

```bash
claude mcp add --transport http administracion-fuentes-publicas https://mcp-afp.manalejandro.com/mcp
```

### Cursor / generic MCP JSON

```json
{
  "mcpServers": {
    "administracion-fuentes-publicas": {
      "url": "https://mcp-afp.manalejandro.com/mcp"
    }
  }
}
```

### Legacy HTTP+SSE clients

```json
{
  "mcpServers": {
    "administracion-fuentes-publicas": {
      "url": "https://mcp-afp.manalejandro.com/sse"
    }
  }
}
```

### Raw discovery (no SDK)

```bash
curl -s https://mcp-afp.manalejandro.com/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'MCP-Protocol-Version: 2026-07-28' \
  -H 'Mcp-Method: server/discover' \
  -d '{"jsonrpc":"2.0","id":1,"method":"server/discover","params":{"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientCapabilities":{}}}}'
```

No authentication is required. The server is read-only and catalog-only: it never fetches third-party URLs, so it cannot be used as an open proxy or for SSRF.

## Tools

| Tool | What it does |
| --- | --- |
| `search_catalog` | Search sources, recipes, products, information needs and identifiers in one query. English and Spanish queries are both accepted. |
| `get_record` | Full record for any id: source, recipe, product, identifier or code group. Returns similar ids when the id does not exist. |
| `list_sources` | Browse and filter sources by sector, administrative level, status, access type or format, with pagination. |
| `list_products` | Data products that can be built today, with their sources, recipes, freshness, volume, licence and main pitfall. |
| `list_recipes` | Ordered procedures that combine sources for a concrete intent. |
| `get_codes` | Code lists that APIs require and nobody can guess: INE operations and variables, DataComex countries, AEMET stations, BOE sections, and more. |
| `find_dead_route` | Check whether a remembered URL is a known dead or moved route, and get its replacement. |
| `list_identifiers` | Identifier formats, regexes, issuers, joins and the pitfalls that break a join. |

Recommended flow:

1. `search_catalog` with the need.
2. `get_record` on the best candidates. **Read `alerts` first** — they are the traps that change a number without raising an error. Then read `quirks`, `ids`, `gotchas`, `endpoints`, `sync` and `rate_limit`.
3. `get_codes` when an endpoint needs an id; `find_dead_route` before trusting an old link.
4. Use the returned endpoint and example with your own HTTP client.

## Resources

| URI | Contents |
| --- | --- |
| `catalog://overview` | Counts, sectors, levels, statuses, access types and formats. |
| `catalog://llms-min` | Short agent-facing quick start. |
| `catalog://llms` | Full agent guide: rules, silent traps, sources by sector, recipes and cross-cutting guides. |
| `catalog://rules` | Only the "rules before coding against a source" section, for a low-token read. |
| `catalog://source/{id}` | Source record. |
| `catalog://recipe/{id}` | Recipe record. |
| `catalog://product/{id}` | Product record. |
| `catalog://identifier/{id}` | Identifier record. |
| `catalog://codes/{group}` | Code list. |

## Prompts

| Prompt | Purpose |
| --- | --- |
| `choose_source` | Pick the best source for a concrete need, with trade-offs, access details, freshness, licence and traps. |
| `build_product` | Turn an idea into a build plan: matching product, sources, recipes, join keys, freshness, volume and pitfalls. |
| `audit_source` | Audit one source for operational risk before relying on it. |

## Protocol support

The Worker serves two MCP eras from the same origin.

### Modern: `2026-07-28`

- `POST /mcp` with a JSON-RPC request.
- Required body metadata in `params._meta`:
  - `io.modelcontextprotocol/protocolVersion`
  - `io.modelcontextprotocol/clientCapabilities` (`{}` is valid)
- Required request headers:
  - `MCP-Protocol-Version`
  - `Mcp-Method`
  - `Mcp-Name` for named operations (`tools/call`, `resources/read`, `prompts/get`)
- Start with `server/discover`. There is no session and no GET stream.
- Results carry `resultType: "complete"` and `_meta["io.modelcontextprotocol/serverInfo"]`.
- Errors follow the protocol profile: `-32602` for invalid parameters or metadata, `-32020` for header/body mismatches, `-32022` for an unsupported version, `-32601` with HTTP 404 for an unknown method.

`GET` and `DELETE` on `/mcp` return `405`, as this revision defines no server-initiated stream and no session to delete.

### Legacy: `2024-11-05` / `2025-11-25`

- Legacy `initialize` handshake on `POST /mcp` when no modern metadata is present.
- Legacy HTTP+SSE on `GET /sse` + `POST /messages?sessionId=…`, backed by a Durable Object per session.
- Legacy results never include `resultType`.

`Origin` is validated on every MCP request. Only the production origin and local development hosts are accepted.

## Other routes

| Route | Purpose |
| --- | --- |
| `/` | Index with tools, resources, prompts and connect snippets. |
| `/sources`, `/sources/{id}`, `/sources/{id}.json` | Browse and inspect sources. |
| `/products`, `/recipes`, `/recipes/{id}` | Products and recipes. |
| `/identifiers` | Identifiers and joins. |
| `/search?q=…` | Search the same index as `search_catalog`. |
| `/catalog.json` | Full catalog. |
| `/llms.txt`, `/llms-min.txt` | Agent-facing guides. |
| `/health` | Status and catalog counts. |
| `/robots.txt`, `/sitemap.xml`, `/favicon.svg` | Crawler and icon files. |

## Data

The Worker bundles a committed copy of the catalog so deploys do not depend on a sibling checkout:

- `src/data/catalog.json` — generated `catalog.json`
- `src/data/llms.ts` — `llms.txt` and `llms-min.txt` as TypeScript strings

Refresh it from a local checkout of the source repository:

```bash
npm run data:sync
# or
CATALOG_SOURCE=/path/to/Administracion-fuentes-publicas npm run data:sync
```

Do not edit `src/data/*` by hand.

## Development

```bash
npm install
npm run dev        # wrangler dev, http://localhost:8787
npm run typecheck  # tsc --noEmit
npm run test       # vitest with the Workers runtime
npm run check      # typecheck + tests
npm run deploy     # wrangler deploy
```

`worker-configuration.d.ts` is generated. After changing bindings in `wrangler.jsonc`:

```bash
npm run cf-typegen
```

## Deployment

`wrangler.jsonc` targets the custom domain `mcp-afp.manalejandro.com` and enables observability logs with traces disabled.

```bash
npx wrangler deploy
```

The Durable Object class `SseSession` backs legacy SSE sessions. The `v1` migration uses SQLite-backed Durable Objects.

## Attribution

Catalog data: [BquantFinance/Administracion-fuentes-publicas](https://github.com/BquantFinance/Administracion-fuentes-publicas), MIT licensed. Each source record carries its own licence field; check it before commercial reuse.

Worker implementation: MIT, see [LICENSE](./LICENSE).
