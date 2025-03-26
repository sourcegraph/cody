import { ClientConfigSingleton, type SourcegraphGuardrailsClient } from '@sourcegraph/cody-shared'
import type { Attribution } from '@sourcegraph/cody-shared/src/guardrails'
import * as vscode from 'vscode'
import { Logger } from '../output-channel-logger'

const logger = new Logger()
const LOG_LABEL = 'Guardrails'

async function getGuardrailsMode(): Promise<'none' | 'permissive' | 'enforced'> {
    const abortController = new AbortController()
    setTimeout(() => abortController.abort('Timed out retrieving client configuration'), 30 * 1000)
    const config = await ClientConfigSingleton.getInstance().getConfig(abortController.signal)
    if (!config) {
        throw new Error('EditGuardrails cannot determine Guardrails mode: no client config')
    }
    return config.attribution
}

function attributionToMessage(attribution: Attribution): string {
    return `Guardrails - found ${attribution.repositories.length}${
        attribution.limitHit ? '+' : ''
    } matching repositories:\n${attribution.repositories.map(repo => repo.name).join('\n')}`
}

/**
 * Provides attribution guardrails to proposed edits.
 */
export class EditGuardrails {
    constructor(private readonly client: SourcegraphGuardrailsClient) {}

    /**
     * Gets whether code should hidden until `canPresentToUser` has checked
     * the completed edit. For example, if this returns `true`, do not show a
     * streaming intermediate code result to the user.
     */
    public async shouldHideCodeBeforeAttribution(): Promise<boolean> {
        const mode = await getGuardrailsMode()
        return mode === 'enforced'
    }

    /**
     * Gets whether an edit of `original` into `proposed` can be presented to
     * the user.
     *
     * @param original the source text being edited.
     * @param proposed the proposed edit produced by the LLM.
     * @returns `true` if it is OK to show the generated code to the user.
     */
    public async canPresentToUser(original: string, proposed: string): Promise<boolean> {
        let mode: 'none' | 'permissive' | 'enforced' | undefined
        try {
            mode = await getGuardrailsMode()
            if (mode === 'none') {
                // No work to do!
                return true
            }

            // If there are less than 10 new or changed lines, skip the attribution check.
            const sourceLines = new Set(original.split(/\r?\n/m))
            const numNewChangedLines = proposed
                .split(/\r?\n/m)
                .filter(line => !sourceLines.has(line)).length
            if (numNewChangedLines < 10) {
                return true
            }

            // Start an attribution check.
            const result = (async () => {
                try {
                    return this.client.searchAttribution(proposed)
                } catch (error) {
                    // Normalize failures to Error instances and return them as a result.
                    return error instanceof Error ? error : new Error(`${error}`)
                }
            })()

            if (mode === 'permissive') {
                // Asynchronously collect the result.
                result.then(attribution => {
                    if (attribution instanceof Error) {
                        // Because we are not in enforcement mode, we do not spam the user with error messages.
                        // TODO: Get product input on whether/how often/how passive mode should surface errors.
                        logger.logDebug(
                            LOG_LABEL,
                            `error performing edits guardrails check, but ignoring because "permissive" mode: ${attribution}`
                        )
                        return
                    }
                    if (attribution.repositories.length) {
                        // The code was found, inform the user.
                        vscode.window.showInformationMessage(attributionToMessage(attribution))
                    }
                })
                // Unblock the edit without waiting for the result.
                return true
            }

            // Synchronously collect the result.
            const progressOptions: vscode.ProgressOptions = {
                title: 'Checking Guardrails',
                location: vscode.ProgressLocation.Window,
            }
            const attribution = await vscode.window.withProgress(progressOptions, () => {
                return result
            })
            if (attribution instanceof Error) {
                // API errors, network errors, etc.: Present the option to retry.
                logger.logDebug(
                    LOG_LABEL,
                    `error performing edits guardrails check, this prevents edits because "${mode}" mode: ${attribution}`
                )
                const choice = await vscode.window.showErrorMessage(
                    `Guardrails - Error: ${attribution.message}`,
                    'Retry',
                    'Cancel'
                )
                switch (choice) {
                    case 'Retry':
                        return this.canPresentToUser(original, proposed)
                    default:
                        return false
                }
            }
            if (attribution.repositories.length !== 0) {
                // Existing code did match, and we are in enforcement mode--inform the user and prevent the edit.
                vscode.window.showInformationMessage(attributionToMessage(attribution))
                return false
            }
            return true
        } catch (error) {
            if (mode === 'none' || mode === 'permissive') {
                logger.logDebug(
                    LOG_LABEL,
                    `error performing edits guardrails check, but ignoring because attribution "${mode}" mode: ${error}`
                )
                return true
            }
            throw error
        }
    }
}
