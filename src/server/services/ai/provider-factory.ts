import type { AiProvider } from "./provider";
import { DeterministicAiProvider } from "./deterministic-provider";

/**
 * Pick the AI provider at runtime. Default is the deterministic provider;
 * set AI_PROVIDER=anthropic (plus ANTHROPIC_API_KEY) to swap in the real
 * one. The Anthropic adapter lives outside this commit — when it lands,
 * wire it in here.
 */
export function getAiProvider(): AiProvider {
  const kind = process.env.AI_PROVIDER ?? "deterministic";
  switch (kind) {
    case "deterministic":
    default:
      return new DeterministicAiProvider();
    // case "anthropic":
    //   return new AnthropicAiProvider({ apiKey: process.env.ANTHROPIC_API_KEY! });
  }
}
