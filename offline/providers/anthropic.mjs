const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const API_URL = 'https://api.anthropic.com/v1/messages';

/**
 * Create an Anthropic provider with optional configuration.
 * @param {object} [options]
 * @param {string} [options.model] - Model ID override (default: claude-sonnet-4-20250514)
 * @returns {{ name: string, generate: (systemPrompt: string, userPrompt: string) => Promise<string> }}
 */
export function createProvider(options = {}) {
  const model = options.model || DEFAULT_MODEL;

  return {
    name: 'anthropic',
    generate: async (systemPrompt, userPrompt) => {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error('anthropic: ANTHROPIC_API_KEY is not set');

      const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`anthropic: ${res.status} ${res.statusText} — ${body}`);
      }

      const data = await res.json();
      return data.content[0].text;
    },
  };
}

const defaultProvider = createProvider();

export const name = defaultProvider.name;
export const generate = defaultProvider.generate;
