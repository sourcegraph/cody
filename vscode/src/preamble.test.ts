import { describe, expect, it } from 'vitest'

import { getChatPreamble, getEditPreamble } from './preamble'

describe('preamble', () => {
    describe('edit preamble', () => {
        it('is as expected', () => {
            const preamble = getEditPreamble()
            expect(preamble).toMatchSnapshot()
        })

        it('is as expected when including the codebase', () => {
            const preamble = getEditPreamble(['github.com/sourcegraph/cody'])
            expect(preamble).toMatchSnapshot()
        })
    })

    describe('chat preamble', () => {
        it('is as expected', () => {
            const preamble = getChatPreamble()
            expect(preamble).toMatchSnapshot()
        })

        it('is as expected when including the codebase', () => {
            const preamble = getChatPreamble(['github.com/sourcegraph/cody'])
            expect(preamble).toMatchSnapshot()
        })
    })
})
