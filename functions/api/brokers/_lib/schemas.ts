import { z } from "zod";
import {
  BROKER_METHODS,
  BROKER_PROVIDER_IDS,
  type BrokerCreateRequest,
  type BrokerUpdateRequest,
} from "../../../../src/lib/brokers/contracts.ts";
import { errorResponse, readJsonBody } from "../../_lib/http.ts";
import type { Env } from "../../_lib/types.ts";

/**
 * Request validation. Validation messages name fields but never echo values,
 * so a malformed secret is never reflected in a response.
 */

const secret = z
  .string()
  .min(8, "must be at least 8 characters")
  // Groww issues its API key as a JWT that routinely exceeds 512 characters;
  // 2048 keeps two secrets plus JSON overhead inside the 8192-byte body cap.
  .max(2048, "must be at most 2048 characters")
  .refine((value) => !/\s/.test(value), "must not contain whitespace");

const hasControlCharacter = (value: string): boolean =>
  [...value].some((char) => {
    const code = char.charCodeAt(0);
    return code < 0x20 || code === 0x7f;
  });

const displayName = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .refine((value) => !hasControlCharacter(value), "must not contain control characters");

export const providerIdSchema = z.enum(BROKER_PROVIDER_IDS);
export const methodSchema = z.enum(BROKER_METHODS);
export const connectionIdSchema = z.string().uuid();

export const createConnectionSchema = z
  .object({
    provider: providerIdSchema,
    method: methodSchema,
    apiKey: secret,
    apiSecret: secret,
    displayName: displayName.optional(),
  })
  .strict() satisfies z.ZodType<BrokerCreateRequest>;

export const authorizeSchema = z
  .object({
    connectionId: connectionIdSchema,
  })
  .strict();

export const updateConnectionSchema = z
  .object({
    displayName: displayName.optional(),
    apiKey: secret.optional(),
    apiSecret: secret.optional(),
  })
  .strict()
  .refine(
    (value) => (value.apiKey === undefined) === (value.apiSecret === undefined),
    { message: "apiKey and apiSecret must be supplied together", path: ["apiKey"] },
  ) satisfies z.ZodType<BrokerUpdateRequest>;

export const stateQuerySchema = z
  .string()
  .min(20)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);

export const requestTokenSchema = z.string().min(1).max(512);

const fieldList = (error: z.ZodError): string => {
  const names = error.issues
    .map((issue) => issue.path.join("."))
    .filter(Boolean)
    .slice(0, 6);
  return names.length > 0 ? `Invalid fields: ${names.join(", ")}.` : "Invalid request body.";
};

type Parsed<T> = { ok: true; data: T } | { ok: false; response: Response };

export const readValidatedBody = async <T>(
  env: Env,
  request: Request,
  schema: z.ZodType<T>,
  maxBytes = 8192,
): Promise<Parsed<T>> => {
  const body = await readJsonBody<unknown>(env, request, maxBytes);
  if (!body.ok) return body;

  const parsed = schema.safeParse(body.data);
  if (!parsed.success) {
    return {
      ok: false,
      response: errorResponse(env, request, 400, fieldList(parsed.error), {}, "invalid_request"),
    };
  }
  return { ok: true, data: parsed.data };
};
