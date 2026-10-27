import { z } from "zod";

type JsonSchemaNode = Record<string, unknown>;

/**
 * Walks a generated JSON Schema and tightens it to what strict structured-output
 * modes demand: every object seals `additionalProperties` and lists all of its
 * properties as required. zod emits neither by default.
 *
 * Optional fields are expressed as nullable in our schemas precisely so this
 * transform is lossless.
 */
function tighten(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(tighten);
  if (node === null || typeof node !== "object") return node;

  const out: JsonSchemaNode = {};
  for (const [key, value] of Object.entries(node as JsonSchemaNode)) {
    out[key] = tighten(value);
  }

  if (
    out.type === "object" &&
    out.properties &&
    typeof out.properties === "object"
  ) {
    out.additionalProperties = false;
    out.required = Object.keys(out.properties as JsonSchemaNode);
  }
  return out;
}

/** zod schema -> strict JSON Schema, for providers that aren't the Anthropic SDK. */
export function toStrictJsonSchema(schema: z.ZodType): JsonSchemaNode {
  const generated = z.toJSONSchema(schema, {
    // Inline everything: many OpenAI-compatible servers reject $defs/$ref.
    io: "output",
    target: "draft-7",
  }) as JsonSchemaNode;
  const tightened = tighten(generated) as JsonSchemaNode;
  // $schema confuses some validators; it carries no constraint information.
  delete tightened.$schema;
  return tightened;
}

/**
 * Pulls the first balanced JSON object out of a model response. Needed because
 * local models commonly wrap JSON in prose or a ```json fence even when told
 * not to.
 */
export function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through to scanning
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const haystack = fenced ? fenced[1].trim() : trimmed;
  try {
    return JSON.parse(haystack);
  } catch {
    // fall through to scanning
  }

  const start = haystack.indexOf("{");
  if (start === -1) throw new Error("No JSON object found in model response.");

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < haystack.length; i++) {
    const char = haystack[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "{") depth++;
    else if (char === "}") {
      depth--;
      if (depth === 0) return JSON.parse(haystack.slice(start, i + 1));
    }
  }
  throw new Error("Model response contained an unterminated JSON object.");
}
