import { describe, expect, test } from 'vitest'
import { LatestSupportedCompletionsStreamAPIVersion, inferCodyApiVersion } from './siteVersion'

describe('inferCodyApiVersion', () => {
    test('returns API version 0 for a legacy instance', () => {
        expect(inferCodyApiVersion('5.2.0', false)).toBe(0)
    })

    test('returns API version 1 for older versions', () => {
        expect(inferCodyApiVersion('5.4.0', false)).toBe(1)
        expect(inferCodyApiVersion('5.5.0', false)).toBe(1)
        expect(inferCodyApiVersion('5.6.0', false)).toBe(1)
        expect(inferCodyApiVersion('5.7.0', false)).toBe(1)
        // branch deployment (2024-09-11 is the cutoff date for 2->8)
        expect(inferCodyApiVersion('5.11.x_313350_2024-09-10_5.11-63a41475e780', false)).toBe(1)
        // main deployment (2024-09-11 is the cutoff date for 2->8)
        expect(inferCodyApiVersion('315302_2024-09-10_5.11-9994f058e2af', false)).toBe(1)
    })

    test('returns API version 2 for newer versions', () => {
        expect(inferCodyApiVersion('5.8.0', false)).toBe(2)
        expect(inferCodyApiVersion('5.9.0', false)).toBe(2)
        expect(inferCodyApiVersion('5.10.1', false)).toBe(2)
    })

    test('API version 8', () => {
        expect(inferCodyApiVersion('6.1.0', false)).toBe(8)
        expect(inferCodyApiVersion('6.2.0', false)).toBe(8)
        // branch deployment
        expect(inferCodyApiVersion('6.1.x_313350_2025-02-25_6.1-63a41475e780', false)).toBe(8)
        // main deployment
        expect(inferCodyApiVersion('315302_2025-03-10_6.1-9994f058e2af', false)).toBe(8)
    })

    test('returns API version 8 for dotcom', () => {
        expect(inferCodyApiVersion('1.2.3', true)).toBe(LatestSupportedCompletionsStreamAPIVersion)
    })
})
