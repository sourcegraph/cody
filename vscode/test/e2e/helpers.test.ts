import { expect } from '@playwright/test'

import { assertEvents, test } from './helpers'

test('assertEvents checks for events in-order allowing extras', async ({ page, sidebar }) => {
    // Perfect match
    expect(() => assertEvents(['a'], ['a'])).toPass()
    expect(() => assertEvents(['a', 'b'], ['a', 'b'])).toPass()

    // Extras
    expect(() => assertEvents(['c', 'a', 'b'], ['a', 'b'])).toPass() // Before
    expect(() => assertEvents(['a', 'b', 'c'], ['a', 'b'])).toPass() // After
    expect(() => assertEvents(['a', 'c', 'b'], ['a', 'b'])).toPass() // Between

    // Require multiple of same
    expect(() => assertEvents(['a', 'a'], ['a', 'a'])).toPass()
    expect(() => assertEvents(['a', 'b', 'a'], ['a', 'a'])).toPass()
    expect(() => assertEvents(['a'], ['a', 'a'])).not.toPass()

    // Other failures
    expect(() => assertEvents([], ['a'])).not.toPass()
    expect(() => assertEvents(['b'], ['a'])).not.toPass()
    expect(() => assertEvents(['ab'], ['a'])).not.toPass()
})
