import { describe, expect, test } from 'vitest'
import {
    DefaultMinimumAPIVersion,
    getLatestSupportedCompletionsStreamAPIVersion,
    inferCodyApiVersion,
    setLatestCodyAPIVersion,
} from './siteVersion'

describe('inferCodyApiVersion', () => {
    test('returns API version 1 for a legacy instance', () => {
        expect(inferCodyApiVersion('5.2.0', false)).toBe(1)
    })

    test('returns API version 1 for older versions', () => {
        expect(inferCodyApiVersion('5.4.0', false)).toBe(1)
        expect(inferCodyApiVersion('5.5.0', false)).toBe(1)
        expect(inferCodyApiVersion('5.6.0', false)).toBe(1)
        expect(inferCodyApiVersion('5.7.0', false)).toBe(1)
    })

    test('returns DefaultMinimumAPIVersion for newer versions when latest not set', () => {
        setLatestCodyAPIVersion(undefined)
        expect(inferCodyApiVersion('5.8.0', false)).toBe(DefaultMinimumAPIVersion)
        expect(inferCodyApiVersion('5.9.0', false)).toBe(DefaultMinimumAPIVersion)
        expect(inferCodyApiVersion('5.10.1', false)).toBe(DefaultMinimumAPIVersion)
    })

    test('returns latestCodyClientConfig for dotcom', () => {
        expect(inferCodyApiVersion('314951_2025-03-07_6.1-abeeb1a5e10d', true)).toBe(8)
    })

    test('returns latestCodyClientConfig for local dev', () => {
        const mockCodyAPIVersion = 1000
        setLatestCodyAPIVersion(mockCodyAPIVersion)
        const serverSideReturnedVersion = getLatestSupportedCompletionsStreamAPIVersion()
        expect(inferCodyApiVersion('0.0.0+dev', false)).toBe(serverSideReturnedVersion)
    })
})
