import { describe, expect, test } from 'vitest'
import { inferCodyApiVersion } from './siteVersion'

describe('inferCodyApiVersion', () => {
    test('returns API version 0 for a legacy instance', () => {
        expect(inferCodyApiVersion('5.2.0', false)).toBe(0)
    })

    test('returns API version 1 for older versions', () => {
        expect(inferCodyApiVersion('5.4.0', false)).toBe(1)
        expect(inferCodyApiVersion('5.5.0', false)).toBe(1)
        expect(inferCodyApiVersion('5.6.0', false)).toBe(1)
        expect(inferCodyApiVersion('5.7.0', false)).toBe(1)
    })

    test('returns API version 2 for newer versions', () => {
        expect(inferCodyApiVersion('5.8.0', false)).toBe(2)
        expect(inferCodyApiVersion('5.9.0', false)).toBe(2)
        expect(inferCodyApiVersion('5.10.1', false)).toBe(2)
    })

    test('returns API version 2 for dotcom', () => {
        expect(inferCodyApiVersion('1.2.3', true)).toBe(2)
    })
})
