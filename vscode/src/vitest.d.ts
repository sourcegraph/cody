import type { Assertion, AsymmetricMatchersContaining } from 'vitest'

// TODO(sqs): necessary to avoid tsc complaining that vitest types do not exist
type __1 = Assertion
type __2 = AsymmetricMatchersContaining

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
