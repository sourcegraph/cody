/**
 * Enum representing various tags that can be applied to a model.
 * These tags are used to categorize and filter models based on model's characteristics.
 * This helps clients to identify the origins and capabilities of a model.
 */
export enum ModelTag {
    // UI Groups
    Power = 'power',
    Speed = 'speed',
    Balanced = 'balanced',

    // Statuses
    Recommended = 'recommended',
    Deprecated = 'deprecated',
    Experimental = 'experimental',

    // Tiers - the level of access to the model
    Pro = 'pro',
    Free = 'free',
    Enterprise = 'enterprise',

    // Origins - where the model comes from
    Gateway = 'gateway',
    BYOK = 'byok',
    Local = 'local',
    Ollama = 'ollama',
    Dev = 'dev',
}
