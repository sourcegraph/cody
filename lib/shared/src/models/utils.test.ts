import { describe, expect, it } from 'vitest'
import { getModelInfo } from './utils'

describe('getModelInfo', () => {
    it('splits model ID and returns provider and title', () => {
        const result = getModelInfo('Anthropic/Claude 2.0')
        expect(result).toEqual({
            provider: 'Anthropic',
            title: 'Claude 2.0',
        })
    })

    it('handles model ID without title', () => {
        const result = getModelInfo('Anthropic/')
        expect(result).toEqual({
            provider: 'Anthropic',
            title: '',
        })
    })

    it('replaces dashes in title with spaces', () => {
        const result = getModelInfo('example/model-with-dashes')
        expect(result).toEqual({
            provider: 'example',
            title: 'model with dashes',
        })
    })

    it('handles model ID with multiple dashes', () => {
        const result = getModelInfo('fireworks/accounts/fireworks/models/mixtral-8x7b-instruct')
        expect(result).toEqual({
            provider: 'fireworks',
            title: 'mixtral 8x7b instruct',
        })
    })
})
