import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { z } from "zod";
import { getSettings, type AiProviderKind } from "@/server/services/settings";
import { extractJsonObject, toStrictJsonSchema } from "./json-schema";

/**
 * Two ways to reach Claude, the same as alfred:
 *
 * - "claude-code" (default): the Claude Code CLI already signed in on this
 *   machine (mounted into the container by chezmoi). No API key; bills the
 *   subscription. Every tool is denied — project notes are untrusted text and
 *   must not be able to talk the agent into touching files or the network.
 * - "anthropic": the Messages API with ANTHROPIC_API_KEY.
 *
 * Both return a validated object: the JSON Schema goes in the system prompt
 * and the reply is parsed and checked against the zod schema on the way back.
 */

export class AiError extends Error {}

export interface ObjectResult<T> {
  object: T;
  provider: AiProviderKind;
  model: string;
}

const DENIED_TOOLS = ["Bash", "Read", "Write", "Edit", "NotebookEdit", "Glob", "Grep", "WebSearch", "WebFetch", "Task", "TodoWrite"];
const ANTHROPIC_ALIASES: Record<string, string> = { opus: "claude-opus-5-5", sonnet: "claude-sonnet-5-5", haiku: "claude-haiku-4-5-20251001" };

export function claudeBinary(): string {
  return process.env.PUROJEKUTO_CLAUDE_BIN?.trim() || "claude";
}

function onPath(bin: string): boolean {
  if (bin.includes(path.sep)) return fs.existsSync(/*turbopackIgnore: true*/ bin);
  return (process.env.PATH ?? "").split(path.delimiter).some((d) => d && fs.existsSync(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ d, bin)));
}

/** Cheap readiness check for the UI; only a real call proves the CLI is signed in. */
export function aiStatus(uid: string): { provider: AiProviderKind; ready: boolean; model: string; reason?: string } {
  const { aiProvider: provider, aiModel: model } = getSettings(uid);
  if (provider === "none") return { provider, ready: false, model, reason: "AI is turned off in Settings." };
  if (provider === "anthropic") {
    return process.env.ANTHROPIC_API_KEY
      ? { provider, ready: true, model }
      : { provider, ready: false, model, reason: "Set ANTHROPIC_API_KEY, or switch to Claude Code in Settings." };
  }
  return onPath(claudeBinary())
    ? { provider, ready: true, model }
    : { provider, ready: false, model, reason: `The Claude Code CLI ("${claudeBinary()}") isn't installed here. chezmoi mounts it into the container; or switch to the Anthropic API in Settings.` };
}

function contract(system: string, schema: z.ZodType): string {
  return `${system}

Respond with a single JSON object and nothing else: no prose, no markdown fence. It must validate against this JSON Schema:
${JSON.stringify(toStrictJsonSchema(schema))}`;
}

function validate<T extends z.ZodType>(schema: T, raw: string, who: string): z.output<T> {
  if (!raw.trim()) throw new AiError(`${who} returned an empty response.`);
  let candidate: unknown;
  try {
    candidate = extractJsonObject(raw);
  } catch {
    throw new AiError(`${who} did not return JSON: ${raw.slice(0, 200)}`);
  }
  const parsed = schema.safeParse(candidate);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new AiError(`${who}'s answer did not match the expected shape: ${issues}`);
  }
  return parsed.data;
}

function runClaudeCode(args: string[], prompt: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let child: ReturnType<typeof spawn>;
    try {
      // An argument array, never a shell: metacharacters in project notes are inert.
      child = spawn(/*turbopackIgnore: true*/ claudeBinary(), args, { stdio: ["pipe", "pipe", "pipe"], env: process.env });
    } catch (e) {
      reject(new AiError(e instanceof Error ? e.message : "Could not start Claude Code"));
      return;
    }
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(() => {
      finish(() => reject(new AiError(`Claude Code did not finish within ${Math.round(timeoutMs / 1000)} s.`)));
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5_000);
    }, timeoutMs);
    child.stdout?.on("data", (c: Buffer) => (stdout += c.toString()));
    child.stderr?.on("data", (c: Buffer) => (stderr = (stderr + c.toString()).slice(-4000)));
    child.on("error", (e: NodeJS.ErrnoException) =>
      finish(() =>
        reject(new AiError(e.code === "ENOENT" ? `Claude Code CLI not found ("${claudeBinary()}").` : e.message)),
      ),
    );
    child.on("close", (code) =>
      finish(() => (code === 0 ? resolve(stdout) : reject(new AiError(`Claude Code exited with code ${code}: ${stderr.trim().slice(0, 400) || "no output"}`)))),
    );
    child.stdin?.on("error", () => {});
    child.stdin?.end(prompt);
  });
}

async function claudeCodeObject<T extends z.ZodType>(model: string, system: string, prompt: string, schema: T): Promise<ObjectResult<z.output<T>>> {
  const args = [
    "-p",
    "--model",
    model,
    "--no-session-persistence",
    "--disable-slash-commands",
    "--disallowedTools",
    ...DENIED_TOOLS,
    "--append-system-prompt",
    contract(system, schema),
    "--output-format",
    "json",
  ];
  const stdout = await runClaudeCode(args, prompt, Number(process.env.PUROJEKUTO_AI_TIMEOUT_MS) || 420_000);
  let payload: { is_error?: boolean; result?: string; modelUsage?: Record<string, unknown> };
  try {
    payload = JSON.parse(stdout.trim());
  } catch {
    throw new AiError(`Claude Code returned output that was not JSON: ${stdout.trim().slice(0, 200)}`);
  }
  if (payload.is_error) {
    const detail = payload.result ?? "no detail";
    if (/not logged in|\/login/i.test(detail)) throw new AiError("Claude Code is not signed in on this machine. Run `claude` in a terminal, sign in, then re-run chezmoi's configure.");
    throw new AiError(`Claude Code failed: ${detail.slice(0, 400)}`);
  }
  return {
    object: validate(schema, payload.result ?? "", "Claude Code"),
    provider: "claude-code",
    model: Object.keys(payload.modelUsage ?? {})[0] ?? model,
  };
}

async function anthropicObject<T extends z.ZodType>(model: string, system: string, prompt: string, schema: T): Promise<ObjectResult<z.output<T>>> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new AiError("ANTHROPIC_API_KEY is not set.");
  const id = ANTHROPIC_ALIASES[model] ?? model;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: id, max_tokens: 8000, system: contract(system, schema), messages: [{ role: "user", content: prompt }] }),
    signal: AbortSignal.timeout(300_000),
  }).catch((e) => {
    throw new AiError(`Anthropic API unreachable: ${e instanceof Error ? e.message : String(e)}`);
  });
  const body = (await res.json().catch(() => ({}))) as { content?: { type: string; text?: string }[]; model?: string; error?: { message?: string } };
  if (!res.ok) throw new AiError(`Anthropic API: ${body.error?.message ?? `HTTP ${res.status}`}`);
  const text = (body.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("");
  return { object: validate(schema, text, "Claude"), provider: "anthropic", model: body.model ?? id };
}

export async function generateObject<T extends z.ZodType>(uid: string, opts: { system: string; prompt: string; schema: T }): Promise<ObjectResult<z.output<T>>> {
  const status = aiStatus(uid);
  if (!status.ready) throw new AiError(status.reason ?? "AI is not configured.");
  return status.provider === "anthropic"
    ? anthropicObject(status.model, opts.system, opts.prompt, opts.schema)
    : claudeCodeObject(status.model, opts.system, opts.prompt, opts.schema);
}
