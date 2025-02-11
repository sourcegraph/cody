import { describe, expect, it } from 'vitest'
import { calculatePayloadSizeInBytes } from './edit-context-logging'

describe('calculatePayloadSizeInBytes', () => {
    it('returns correct byte size for an object payload', () => {
        const payload = { a: 1, b: 'test' }
        const expected = Buffer.byteLength(JSON.stringify(payload), 'utf8')
        const result = calculatePayloadSizeInBytes(payload)
        expect(result).toBe(expected)
    })

    it('returns correct byte size for a string payload', () => {
        const payload = 'Hello, World!'
        const expected = Buffer.byteLength(JSON.stringify(payload), 'utf8')
        const result = calculatePayloadSizeInBytes(payload)
        expect(result).toBe(expected)
    })

    it('returns undefined when JSON.stringify fails', () => {
        // Creating a circular reference to force JSON.stringify to throw an error.
        const payload: any = {}
        payload.self = payload
        const result = calculatePayloadSizeInBytes(payload)
        expect(result).toBeUndefined()
    })
})
