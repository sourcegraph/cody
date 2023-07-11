import { Hooks, PreChatHook } from '.'

/**
 * The configuration schema for user-defined hooks.
 */
export interface HooksConfiguration {
    /**
     * An array of JavaScript function literals that define pre-chat hooks.
     *
     * TODO(sqs): this is a hacky way to define them!
     */
    preChat?: string[]
}

/**
 * Read user-defined hooks from configuration and return a hooks object.
 */
export function hooksFromConfiguration(configuration?: HooksConfiguration): Hooks | undefined {
    return {
        preChat: configuration?.preChat?.map(hook => ({ run: eval(hook) as PreChatHook['run'] })),
    }
}
