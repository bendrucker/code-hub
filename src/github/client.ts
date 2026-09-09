import { z } from "zod";
import { rateLimitResponse, type RateLimit } from "./schema";

const ENDPOINT = "https://api.github.com/graphql";
const USER_AGENT = "code-hub (+https://github.com/bendrucker/code-hub)";

// GitHub scores a query on the nodes it asks for, so a page costs more than the
// one point it reads as. Stopping with headroom leaves a run ending on a
// watermark it can resume from rather than on a 403.
export const RATE_LIMIT_FLOOR = 100;

export class GitHubHttpError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string) {
    super(`GitHub GraphQL responded ${status}`);
    this.name = "GitHubHttpError";
    this.status = status;
    this.body = body;
  }
}

const graphqlErrors = z.array(z.object({ message: z.string(), type: z.string().optional() }));

export type GraphQLErrorEntry = z.infer<typeof graphqlErrors>[number];

export class GraphQLQueryError extends Error {
  readonly errors: GraphQLErrorEntry[];

  constructor(errors: GraphQLErrorEntry[]) {
    super(`GitHub GraphQL returned errors: ${errors.map((error) => error.message).join("; ")}`);
    this.name = "GraphQLQueryError";
    this.errors = errors;
  }
}

// Thrown on the response that crossed the floor rather than on the one that
// would have failed. The page it carried is dropped, and the caller resumes
// from the last watermark it committed once `resetAt` passes.
export class RateLimitExhausted extends Error {
  readonly remaining: number;
  readonly resetAt: string;

  constructor(remaining: number, resetAt: string) {
    super(`GitHub GraphQL rate limit down to ${remaining}, resets at ${resetAt}`);
    this.name = "RateLimitExhausted";
    this.remaining = remaining;
    this.resetAt = resetAt;
  }
}

export interface GraphQLOptions {
  fetch?: typeof globalThis.fetch;
  endpoint?: string;
  floor?: number;
}

export interface GraphQLResponse {
  data: unknown;
  // The bytes as received. Raw storage archives these before validation, so a
  // schema bug stays diagnosable against what GitHub actually said.
  body: string;
  rateLimit: RateLimit;
}

const envelope = z.object({
  data: z.unknown(),
  errors: graphqlErrors.optional(),
});

export async function graphql(
  token: string,
  query: string,
  variables: Record<string, unknown>,
  options: GraphQLOptions = {},
): Promise<GraphQLResponse> {
  // workerd's native fetch throws "Illegal invocation" when called with a
  // foreign `this`. An arrow wrapper keeps late binding without that risk.
  const transport = options.fetch ?? ((input, init) => globalThis.fetch(input, init));

  const response = await transport(options.endpoint ?? ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify({ query, variables }),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new GitHubHttpError(response.status, body);
  }

  const parsed = envelope.parse(JSON.parse(body));
  if (parsed.errors && parsed.errors.length > 0) {
    throw new GraphQLQueryError(parsed.errors);
  }

  const { rateLimit } = rateLimitResponse.parse(parsed.data);
  if (rateLimit.remaining < (options.floor ?? RATE_LIMIT_FLOOR)) {
    throw new RateLimitExhausted(rateLimit.remaining, rateLimit.resetAt);
  }

  return { data: parsed.data, body, rateLimit };
}
