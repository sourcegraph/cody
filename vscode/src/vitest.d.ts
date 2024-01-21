import type { Assertion, AsymmetricMatchersContaining } from 'vitest'

interface CustomMatchers<R = unknown> {
    /**
     * Checks if `CompletionParameters[]` contains one item with single-line stop sequences.
     */
    toBeSingleLine(): R
    /**
     * Checks if `CompletionParameters[]` contains three items with multi-line stop sequences.
     */
    toBeMultiLine(): R
}

declare module 'vitest' {
    interface Assertion<T = any> extends CustomMatchers<T> {}
    interface AsymmetricMatchersContaining extends CustomMatchers {}
}
