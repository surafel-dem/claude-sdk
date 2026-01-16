/**
 * Model Providers Configuration
 * 
 * Defines available LLM providers and their models.
 * Each provider uses Anthropic-compatible API with different base URLs.
 */

export const MODEL_PROVIDERS = {
    claude: {
        id: 'claude',
        name: 'Claude',
        icon: '/icons/models/anthropic.svg',
        models: [
            { id: 'claude-sonnet-4-20250514', name: 'Sonnet 4', tag: 'Best' },
            { id: 'claude-3-5-haiku-20241022', name: 'Haiku 3.5', tag: 'Fast' },
            { id: 'claude-3-opus-20240229', name: 'Opus 3', tag: 'Capable' },
        ],
    },
    minimax: {
        id: 'minimax',
        name: 'MiniMax',
        icon: '/icons/models/minimax.svg',
        models: [
            { id: 'MiniMax-M2.1', name: 'M2.1', tag: 'Default' },
        ],
    },
    glm: {
        id: 'glm',
        name: 'GLM',
        icon: '/icons/models/zai.svg',
        models: [
            { id: 'glm-4.5-air', name: 'GLM 4.5 Air', tag: 'Fast' },
            { id: 'glm-4.6', name: 'GLM 4.6', tag: 'Best' },
        ],
    },
    kimi: {
        id: 'kimi',
        name: 'Kimi K2',
        icon: '/icons/models/moonshot.svg',
        models: [
            { id: 'kimi-k2-0711-preview', name: 'K2 Preview', tag: 'New' },
        ],
    },
} as const;

export type ProviderId = keyof typeof MODEL_PROVIDERS;
export type ModelId = string;

export interface ModelConfig {
    providerId: ProviderId;
    modelId: ModelId;
}

// Helper to get provider by id
export function getProvider(id: ProviderId) {
    return MODEL_PROVIDERS[id];
}

// Helper to get model display name
export function getModelDisplayName(config: ModelConfig): string {
    const provider = MODEL_PROVIDERS[config.providerId];
    const model = provider.models.find(m => m.id === config.modelId);
    return model?.name || config.modelId;
}

// Default model configuration
export const DEFAULT_MODEL: ModelConfig = {
    providerId: 'minimax',
    modelId: 'MiniMax-M2.1',
};
