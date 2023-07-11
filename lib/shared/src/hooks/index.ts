import { ContextHook } from './contextHook'

export { ContextHook }

/**
 * Hooks are functions that are called when Cody performs specific steps or actions.
 */
export interface Hooks {
    contextHooks?: ContextHook[]
}
