/**
 * LLM Provider interface.
 * Every provider must export: { name: string, generate: async (systemPrompt, userPrompt) => string }
 */

/**
 * Validates that a provider object conforms to the expected interface.
 * @param {object} provider
 * @param {string} provider.name - Human-readable provider name
 * @param {function} provider.generate - async (systemPrompt: string, userPrompt: string) => string
 * @returns {object} The validated provider
 * @throws {Error} If the provider is missing required fields
 */
export function validateProvider(provider) {
  if (!provider?.name || typeof provider.generate !== 'function') {
    throw new Error(`Invalid provider: must export { name, generate }`);
  }
  return provider;
}
