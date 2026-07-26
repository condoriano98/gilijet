import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import {
  describeFeature,
  findCustomer,
  getBooking,
  listBookings,
  listCoupons,
  listFeatures,
  listRefunds,
  operators,
  platformMetrics,
  upcomingDepartures,
} from "@/lib/mcp/tools";
import { FEATURES, statusCounts } from "@/lib/feature-catalog";

/**
 * Read-only MCP endpoint for a reviewer who must not be able to change
 * anything.
 *
 * HTTP rather than a local stdio server on purpose: the reviewer never holds a
 * database credential. A credential would let them bypass these tools entirely
 * with psql, which is the whole reason the tool surface alone is not a security
 * boundary. Here the only reachable surface is what this file exposes, the code
 * is deployed from the repo rather than running on their machine, and access is
 * withdrawn by rotating one environment variable instead of altering database
 * grants.
 *
 * Two layers keep it read-only: no tool performs a write, and every query goes
 * through lib/mcp/readonly-client.ts, which throws on any mutating Prisma
 * operation even though the app's own credential is read-write.
 *
 * JSON-RPC is hand-rolled — it is a handful of methods, and it avoids adding
 * the MCP SDK plus an adapter to bridge its Node-stream transport into an App
 * Router handler.
 */

export const runtime = "nodejs"; // Prisma + node:crypto
export const dynamic = "force-dynamic";

const PROTOCOL_VERSION = "2024-11-05";

type ToolDef = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
};

const str = (description: string) => ({ type: "string", description });
const int = (description: string) => ({ type: "integer", description });

const TOOLS: ToolDef[] = [
  {
    name: "list_features",
    description:
      "Inventory of what this platform does. Each entry carries a status separating shipped from partial, placeholder, schema-only and alias, so unfinished routes are not mistaken for working features. Start here.",
    inputSchema: {
      type: "object",
      properties: {
        area: {
          type: "string",
          enum: ["customer", "operator", "admin", "api", "platform"],
          description: "Restrict to one area.",
        },
        status: {
          type: "string",
          enum: ["shipped", "partial", "broken", "placeholder", "schema-only", "alias"],
          description: "Restrict to one status.",
        },
      },
    },
    handler: (a) => listFeatures(a as { area?: string; status?: string }),
  },
  {
    name: "describe_feature",
    description:
      "Everything known about one feature: its routes, the lib modules that own the logic, the Prisma models it touches, and any caveat.",
    inputSchema: {
      type: "object",
      properties: { id: str("Feature id from list_features.") },
      required: ["id"],
    },
    handler: (a) => describeFeature(a as { id?: string }),
  },
  {
    name: "platform_metrics",
    description:
      "Business rollup for a window: GMV, confirmed bookings, platform commission, operator payout, effective take-rate, coupon spend, active operators.",
    inputSchema: {
      type: "object",
      properties: {
        from: str("Start date YYYY-MM-DD (WITA). Omit for all time."),
        to: str("End date YYYY-MM-DD (WITA)."),
      },
    },
    handler: (a) => platformMetrics(a as { from?: string; to?: string }),
  },
  {
    name: "operators",
    description:
      "List operators, or pass id for one operator with its KYB document states. Bank details are never returned.",
    inputSchema: {
      type: "object",
      properties: {
        id: str("Operator id. Omit to list."),
        limit: int("Max rows, default 25, max 100."),
      },
    },
    handler: (a) => operators(a as { id?: string; limit?: number }),
  },
  {
    name: "list_bookings",
    description:
      "Bookings filtered by date, status and operator. Returns a page plus the true total — do not read one page as the full set.",
    inputSchema: {
      type: "object",
      properties: {
        from: str("Start date YYYY-MM-DD (WITA)."),
        to: str("End date YYYY-MM-DD (WITA)."),
        status: {
          type: "string",
          enum: [
            "PENDING_PAYMENT",
            "CONFIRMED",
            "CANCELLED_BY_CUSTOMER",
            "CANCELLED_BY_OPERATOR",
            "EXPIRED",
          ],
        },
        operatorId: str("Restrict to one operator."),
        limit: int("Max rows, default 25, max 100."),
      },
    },
    handler: (a) =>
      listBookings(
        a as { from?: string; to?: string; status?: string; operatorId?: string; limit?: number },
      ),
  },
  {
    name: "get_booking",
    description:
      "One booking in full: customer, journey, money split, coupon, payment, refund and tickets.",
    inputSchema: {
      type: "object",
      properties: { reference: str("Booking reference, e.g. GJ-2026-000123.") },
      required: ["reference"],
    },
    handler: (a) => getBooking(a as { reference?: string }),
  },
  {
    name: "find_customer",
    description: "Look up a customer by email and list their bookings.",
    inputSchema: {
      type: "object",
      properties: {
        email: str("Customer email address."),
        limit: int("Max bookings, default 25, max 100."),
      },
      required: ["email"],
    },
    handler: (a) => findCustomer(a as { email?: string; limit?: number }),
  },
  {
    name: "list_refunds",
    description: "Refunds with their reason, status and total refunded for the window.",
    inputSchema: {
      type: "object",
      properties: {
        from: str("Start date YYYY-MM-DD (WITA)."),
        to: str("End date YYYY-MM-DD (WITA)."),
        status: {
          type: "string",
          enum: ["PENDING", "APPROVED", "REJECTED", "PROCESSING", "COMPLETED", "FAILED"],
        },
        limit: int("Max rows, default 25, max 100."),
      },
    },
    handler: (a) =>
      listRefunds(a as { from?: string; to?: string; status?: string; limit?: number }),
  },
  {
    name: "list_coupons",
    description:
      "Coupons with budget burn, redemption counts and which side absorbs the discount.",
    inputSchema: {
      type: "object",
      properties: { limit: int("Max rows, default 25, max 100.") },
    },
    handler: (a) => listCoupons(a as { limit?: number }),
  },
  {
    name: "upcoming_departures",
    description: "Future departures with seat occupancy.",
    inputSchema: {
      type: "object",
      properties: {
        operatorId: str("Restrict to one operator."),
        limit: int("Max rows, default 25, max 100."),
      },
    },
    handler: (a) => upcomingDepartures(a as { operatorId?: string; limit?: number }),
  },
];

// ---------- auth ----------

/** Constant-time bearer check. Fails closed when the token is unconfigured. */
function authorize(req: Request): { ok: true } | { ok: false; status: number; error: string } {
  const expected = process.env.MCP_REVIEWER_TOKEN;
  if (!expected) {
    return {
      ok: false,
      status: 503,
      error: "MCP_REVIEWER_TOKEN is not set on the server; this endpoint is disabled.",
    };
  }

  const header = req.headers.get("authorization");
  const provided = header?.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : null;
  if (!provided) return { ok: false, status: 401, error: "Unauthorized" };

  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  return { ok: true };
}

// ---------- JSON-RPC ----------

type RpcRequest = { jsonrpc?: string; id?: unknown; method?: string; params?: Record<string, unknown> };

function result(id: unknown, value: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, result: value });
}

function rpcError(id: unknown, code: number, message: string) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
}

export async function POST(req: Request) {
  const auth = authorize(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: RpcRequest;
  try {
    body = (await req.json()) as RpcRequest;
  } catch {
    return rpcError(null, -32700, "Parse error");
  }

  const { id, method, params } = body;

  switch (method) {
    case "initialize":
      return result(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {}, resources: {} },
        serverInfo: { name: "gilijet-review", version: "1.0.0" },
        instructions:
          "Read-only review access to Gilijet. No tool can modify anything. Call list_features first to see what exists — statuses distinguish shipped features from placeholders, schema-only models and unreachable routes. All times are WITA (UTC+8); all amounts are IDR.",
      });

    case "notifications/initialized":
      return new NextResponse(null, { status: 204 });

    case "ping":
      return result(id, {});

    case "tools/list":
      return result(id, {
        tools: TOOLS.map(({ name, description, inputSchema }) => ({
          name,
          description,
          inputSchema,
        })),
      });

    case "tools/call": {
      const name = typeof params?.name === "string" ? params.name : "";
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) return rpcError(id, -32602, `Unknown tool "${name}"`);

      const args = (params?.arguments ?? {}) as Record<string, unknown>;
      const started = Date.now();
      try {
        const value = await tool.handler(args);
        // Read log: the reviewer is authorised to read customer records, so
        // there should be a record of what was pulled. stdout only — writing an
        // AuditLog row would be a write, which this endpoint must never make.
        console.log(
          `[mcp] tool=${name} args=${JSON.stringify(args)} ms=${Date.now() - started}`,
        );
        return result(id, {
          content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Tool failed";
        console.error(`[mcp] tool=${name} failed:`, err);
        return result(id, {
          content: [{ type: "text", text: `Error: ${message}` }],
          isError: true,
        });
      }
    }

    case "resources/list":
      return result(id, {
        resources: [
          {
            uri: "gilijet://features",
            name: "Feature catalog",
            description: "Full inventory with statuses, routes, modules and models.",
            mimeType: "application/json",
          },
        ],
      });

    case "resources/read": {
      const uri = typeof params?.uri === "string" ? params.uri : "";
      if (uri !== "gilijet://features") {
        return rpcError(id, -32602, `Unknown resource "${uri}"`);
      }
      return result(id, {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(
              { counts: statusCounts(), features: FEATURES },
              null,
              2,
            ),
          },
        ],
      });
    }

    default:
      return rpcError(id, -32601, `Method not found: ${method ?? "(none)"}`);
  }
}

export async function GET() {
  return NextResponse.json(
    { error: "This is an MCP endpoint. Use POST with JSON-RPC." },
    { status: 405 },
  );
}
