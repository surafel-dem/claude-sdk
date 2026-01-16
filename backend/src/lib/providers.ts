/**
 * Provider Configuration
 * 
 * Manages Anthropic-compatible API configurations for different providers.
 * Each provider has its own base URL and API key.
 */

export type ProviderId = 'claude' | 'minimax' | 'glm' | 'kimi';

export interface ProviderConfig {
    baseUrl: string;
    apiKey: string;
}

/**
 * Get provider configuration from environment variables
 */
export function getProviderConfig(providerId: ProviderId): ProviderConfig {
    switch (providerId) {
        case 'claude':
            return {
                baseUrl: process.env.CLAUDE_BASE_URL || 'https://api.anthropic.com',
                apiKey: process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY || '',
            };
        case 'minimax':
            return {
                // Fallback to ANTHROPIC_* if MINIMAX_* not set (for existing configs)
                baseUrl: process.env.MINIMAX_BASE_URL || process.env.ANTHROPIC_BASE_URL || 'https://api.minimax.io/anthropic',
                apiKey: process.env.MINIMAX_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || '',
            };
        case 'glm':
            return {
                baseUrl: process.env.GLM_BASE_URL || 'https://api.z.ai/api/anthropic',
                apiKey: process.env.GLM_API_KEY || '',
            };
        case 'kimi':
            return {
                baseUrl: process.env.KIMI_BASE_URL || 'https://api.moonshot.cn/anthropic',
                apiKey: process.env.KIMI_API_KEY || '',
            };
        default:
            throw new Error(`Unknown provider: ${providerId}`);
    }
}

/**
 * Apply provider configuration to environment
 * Sets ANTHROPIC_BASE_URL and ANTHROPIC_AUTH_TOKEN for Agent SDK
 */
export function applyProviderConfig(providerId: ProviderId): void {
    const config = getProviderConfig(providerId);
    process.env.ANTHROPIC_BASE_URL = config.baseUrl;
    process.env.ANTHROPIC_AUTH_TOKEN = config.apiKey;
    console.log(`[providers] Applied config for ${providerId}: baseUrl=${config.baseUrl}, key=${config.apiKey ? '***' : 'MISSING'}`);
}

/**
 * Get default provider from environment
 */
export function getDefaultProvider(): ProviderId {
    return (process.env.DEFAULT_PROVIDER as ProviderId) || 'minimax';
}
