import { Message } from '../sourcegraph-api'

import { Hooks } from '.'

/**
 * A HooksExecutor runs the hooks defined for a given step.
 */
export interface HooksExecutor {
    /**
     * Runs all pre-chat hooks and returns the augmented messages.
     *
     * @param input The input chat messages.
     * @returns The augmented messages.
     */
    preChat(messages: Message[]): Message[]
}

export function createHooksExecutor(hooks: Hooks): HooksExecutor {
    return {
        preChat(messages) {
            if (hooks.preChat) {
                for (const { run } of hooks.preChat) {
                    messages = run(messages)
                }
            }
            console.log('ran pre-chat hook', messages)
            return messages
        },
    }
}
