import { execFile } from "node:child_process";
import os from "node:os";
import type { LLMClient } from "../types/index.js";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
export const DEFAULT_MODEL = "gpt-5.6-terra";

const SYSTEM_PROMPT = `You are a code repository evaluator. Your job is to assess whether a repository meets specific readiness criteria.

You will receive:
- A criterion prompt describing what to evaluate
- Context gathered from the repository (file contents, structure, etc.)

Analyze the provided context against the criterion and respond with a JSON object in this exact format:
{
  "pass": boolean,
  "message": "A concise summary of the evaluation result",
  "details": "Optional detailed explanation with specific findings"
}

Rules:
- "pass" must be true if the criterion is clearly met, false otherwise.
- "message" should be a single sentence summarizing the result.
- "details" should include specific evidence from the context when relevant.
- Respond ONLY with the JSON object, no markdown fences or extra text.`;

interface LLMClientOptions {
  apiKey: string;
  apiBaseUrl?: string;
  model?: string;
}

interface ChatCompletionResponse {
  choices: Array<{
    message: {
      content: string | null;
    };
  }>;
}

export function createLLMClient(options: LLMClientOptions): LLMClient {
  const { apiKey, apiBaseUrl = DEFAULT_BASE_URL } = options;
  const model = options.model || DEFAULT_MODEL;

  const evaluate: LLMClient["evaluate"] = async (prompt, context) => {
    try {
      const url = `${apiBaseUrl.replace(/\/+$/, "")}/chat/completions`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: `## Criterion\n${prompt}\n\n## Repository Context\n${context}`,
            },
          ],
          response_format: { type: "json_object" },
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "unknown error");
        return {
          pass: false,
          message: `LLM API request failed with status ${response.status}`,
          details: errorBody,
        };
      }

      const data = (await response.json()) as ChatCompletionResponse;
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        return {
          pass: false,
          message: "LLM returned an empty response",
        };
      }

      const parsed = JSON.parse(content) as {
        pass: boolean;
        message: string;
        details?: string;
      };

      return {
        pass: Boolean(parsed.pass),
        message: parsed.message ?? "No message provided",
        ...(parsed.details != null ? { details: parsed.details } : {}),
      };
    } catch (error: unknown) {
      const errMessage =
        error instanceof Error ? error.message : String(error);
      return {
        pass: false,
        message: `LLM evaluation failed: ${errMessage}`,
      };
    }
  };

  return { evaluate };
}

const RESULT_SCHEMA = JSON.stringify({
  type: "object",
  properties: { pass: { type: "boolean" }, message: { type: "string" }, details: { type: "string" } },
  required: ["pass", "message"],
});

/**
 * Runs the evaluation through the local Claude Code CLI (`claude -p`), so it uses the
 * user's existing Claude login instead of an API key. No tools, settings, hooks or MCP
 * servers are loaded: the model only sees the criterion and the gathered context.
 */
export function createClaudeCliClient(options: { model?: string; bin?: string } = {}): LLMClient {
  const model = options.model || "sonnet";
  const bin = options.bin || "claude";

  const evaluate: LLMClient["evaluate"] = (prompt, context) =>
    new Promise((resolve) => {
      const child = execFile(
        bin,
        [
          "-p",
          "--model", model,
          "--tools", "",
          "--setting-sources", "",
          "--strict-mcp-config",
          "--disable-slash-commands",
          "--no-session-persistence",
          "--output-format", "json",
          "--json-schema", RESULT_SCHEMA,
          "--system-prompt", SYSTEM_PROMPT,
        ],
        // A neutral cwd keeps CLAUDE.md files of the scanned or current repo out of the prompt.
        { cwd: os.tmpdir(), timeout: 180_000, maxBuffer: 20 * 1024 * 1024 },
        (error, stdout) => {
          try {
            const out = JSON.parse(stdout) as { is_error?: boolean; result?: string; structured_output?: { pass: boolean; message: string; details?: string } };
            if (out.is_error || !out.structured_output) {
              resolve({ pass: false, message: `Claude CLI evaluation failed: ${out.result ?? "no structured output"}` });
              return;
            }
            const r = out.structured_output;
            resolve({ pass: Boolean(r.pass), message: r.message ?? "No message provided", ...(r.details ? { details: r.details } : {}) });
          } catch {
            resolve({ pass: false, message: `Claude CLI evaluation failed: ${error?.message ?? "unreadable output"}` });
          }
        },
      );
      child.stdin?.end(`## Criterion\n${prompt}\n\n## Repository Context\n${context}`);
    });

  return { evaluate };
}
