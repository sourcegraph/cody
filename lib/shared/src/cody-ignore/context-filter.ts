import type { URI } from 'vscode-uri'

import { IgnoreHelper } from './ignore-helper'

export const ignores = new IgnoreHelper()

// TODO: It would be better to use a vscode.EventEmitter and support multiple
// listeners, etc. but lib/shared prevents doing that easily.
let ignorePolicyChangeListener = () => {}

/**
 * Sets an event listener that will be notified when the Cody Ignore policy
 * may have changed. There can only be one listener registered at a time.
 *
 * @param listener the callback to invoke when the policy changes.
 */
export function setIgnorePolicyChangeListener(listener: () => void): void {
    ignorePolicyChangeListener = listener
}

interface IgnorePolicyOverride {
    repoRe: RegExp
    uriRe: RegExp
}

let testingIgnorePolicyOverride: IgnorePolicyOverride | undefined = undefined

/**
 * Sets an override "ignore" policy for testing.
 */
export function setTestingIgnorePolicyOverride(policy: IgnorePolicyOverride | undefined): void {
    console.warn('overriding Cody Ignore policy for testing')
    testingIgnorePolicyOverride = policy
    ignorePolicyChangeListener()
}

/**
 * Checks if a local file should be ignored by Cody based on the ignore rules.
 *
 * Takes URI with file scheme to ensure absolute file paths are ignored correctly across workspaces
 *
 * 🚨 SECURITY: Each Cody service is responsible for ensuring context from cody ignored files are removed from all LLM requests.
 * See ./ignore-helper.ts for more details.
 */
export function isCodyIgnoredFile(uri: URI): boolean {
    if (testingIgnorePolicyOverride) {
        console.warn(
            `isCodyIgnoredFile called with testingIgnore override: ${testingIgnorePolicyOverride.uriRe}`
        )
        return testingIgnorePolicyOverride.uriRe.test(uri.toString())
    }
    return ignores.isIgnored(uri)
}
