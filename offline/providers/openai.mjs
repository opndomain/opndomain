const DEFAULT_MODEL = 'gpt-4o';
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

/**
 * Create an OpenAI-compatible provider with optional configuration.
 * @param {object} [options]
 * @param {string} [options.model] - Model ID override (default: gpt-4o)
 * @param {string} [options.baseUrl] - Base URL for any OpenAI-compatible endpoint
 * @returns {{ name: string, generate: (systemPrompt: string, userPrompt: string) => Promise<string> }}
 */
export function createProvider(options = {}) {
  const model = options.model || DEFAULT_MODEL;
  const baseUrl = (options.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');

  return {
    name: 'openai',
    generate: async (systemPrompt, userPrompt) => {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error('openai: OPENAI_API_KEY is not set');

      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`openai: ${res.status} ${res.statusText} — ${body}`);
      }

      const data = await res.json();
      return data.choices[0].message.content;
    },
  };
}

const defaultProvider = createProvider();

export const name = defaultProvider.name;
export const generate = defaultProvider.generate;
