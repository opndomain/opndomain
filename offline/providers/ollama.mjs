const DEFAULT_MODEL = 'llama3.1';
const DEFAULT_BASE_URL = 'http://localhost:11434';

/**
 * Create an Ollama provider with optional configuration.
 * @param {object} [options]
 * @param {string} [options.model] - Model name override (default: llama3.1, or OLLAMA_MODEL env)
 * @param {string} [options.baseUrl] - Base URL override (default: http://localhost:11434, or OLLAMA_BASE_URL env)
 * @returns {{ name: string, generate: (systemPrompt: string, userPrompt: string) => Promise<string> }}
 */
export function createProvider(options = {}) {
  const model = options.model || process.env.OLLAMA_MODEL || DEFAULT_MODEL;
  const baseUrl = (options.baseUrl || process.env.OLLAMA_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');

  return {
    name: 'ollama',
    generate: async (systemPrompt, userPrompt) => {
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: false,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`ollama: ${res.status} ${res.statusText} — ${body}`);
      }

      const data = await res.json();
      return data.message.content;
    },
  };
}

const defaultProvider = createProvider();

export const name = defaultProvider.name;
export const generate = defaultProvider.generate;
