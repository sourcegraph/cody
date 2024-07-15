import { describe, expect, it } from 'vitest'
import { extractXMLArray } from './util'

describe('extractXMLArray', () => {
    it('should extract XML tags correctly', () => {
        const text = '<tag>value1</tag><tag>value2</tag><tag>value3</tag>'
        const result = extractXMLArray(text, 'tag')
        expect(result).toEqual(['value1', 'value2', 'value3'])
    })

    it('should handle empty tags', () => {
        const text = '<tag></tag><tag>value</tag><tag></tag>'
        const result = extractXMLArray(text, 'tag')
        expect(result).toEqual(['', 'value', ''])
    })

    it('should handle missing end tags', () => {
        const text = '<tag>value1</tag><tag>value2</tag><tag>value3'
        const result = extractXMLArray(text, 'tag')
        expect(result).toEqual(['value1', 'value2'])
    })

    it('should handle missing start tags', () => {
        const text = 'value1</tag><tag>value2</tag>'
        const result = extractXMLArray(text, 'tag')
        expect(result).toEqual(['value2'])
    })

    it('should handle empty input', () => {
        const text = ''
        const result = extractXMLArray(text, 'tag')
        expect(result).toEqual([])
    })
})
