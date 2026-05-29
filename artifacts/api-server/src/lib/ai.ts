import OpenAI from "openai";

export class AIConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AIConfigError";
  }
}

const GEMINI_OPENAI_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai/";

interface AIConfig {
  apiKey: string;
  baseURL: string | undefined;
  model: string;
}

/**
 * Resolve the AI provider configuration.
 *
 * Precedence:
 *  1. GEMINI_API_KEY  -> Google Gemini via its OpenAI-compatible endpoint (free tier).
 *  2. OPENAI_API_KEY  -> OpenAI directly (production on Hostinger uses a real key).
 *  3. AI_INTEGRATIONS_OPENAI_* -> Replit AI proxy (in-Replit testing only).
 *
 * Throws AIConfigError (mapped to a clear 500 message) when nothing is configured,
 * which is the expected state in production until the user sets a key on Hostinger.
 */
export function resolveAIConfig(): AIConfig {
  const geminiKey = process.env["GEMINI_API_KEY"];
  if (geminiKey) {
    return {
      apiKey: geminiKey,
      baseURL: process.env["AI_BASE_URL"] || GEMINI_OPENAI_BASE_URL,
      model: process.env["AI_MODEL"] || "gemini-2.5-flash",
    };
  }

  const openaiKey = process.env["OPENAI_API_KEY"];
  if (openaiKey) {
    return {
      apiKey: openaiKey,
      baseURL: process.env["AI_BASE_URL"] || process.env["OPENAI_BASE_URL"],
      model: process.env["AI_MODEL"] || "gpt-4o-mini",
    };
  }

  const replitKey = process.env["AI_INTEGRATIONS_OPENAI_API_KEY"];
  const replitBase = process.env["AI_INTEGRATIONS_OPENAI_BASE_URL"];
  if (replitKey && replitBase) {
    return {
      apiKey: replitKey,
      baseURL: replitBase,
      model: process.env["AI_MODEL"] || "gpt-4o-mini",
    };
  }

  throw new AIConfigError(
    "لم يتم ضبط مفتاح الذكاء الاصطناعي. أضف GEMINI_API_KEY (أو OPENAI_API_KEY) في متغيرات البيئة. " +
      "AI provider key is not configured. Set GEMINI_API_KEY or OPENAI_API_KEY.",
  );
}

export function getAIClient(): { client: OpenAI; model: string } {
  const config = resolveAIConfig();
  const client = new OpenAI({
    apiKey: config.apiKey,
    ...(config.baseURL ? { baseURL: config.baseURL } : {}),
  });
  return { client, model: config.model };
}

export function isAIConfigured(): boolean {
  try {
    resolveAIConfig();
    return true;
  } catch {
    return false;
  }
}
