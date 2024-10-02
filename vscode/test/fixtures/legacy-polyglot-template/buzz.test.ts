import { describe, expect, test } from 'vitest'
import { fizzbuzz } from './buzz'

describe('fizzbuzz', () => {
    test('returns correct array', () => {
        const result = fizzbuzz()
        expect(result[0]).toBe('1')
        expect(result[2]).toBe('Fizz')
        expect(result[4]).toBe('Buzz')
        expect(result[14]).toBe('FizzBuzz')
    })
})
