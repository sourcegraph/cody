import { DocumentOffsets } from './offsets'

describe('DocumentOffsets', () => {
    it('converts offsets to positions and back and back properly', () => {
        const texts = [
            `ABC
DEF
GHI`,
            `ABC
DEF
GHI
`,
        ]
        for (const text of texts) {
            const offset = new DocumentOffsets(text)

            for (let i = 0; i < text.length + 1; i++) {
                const pos = offset.position(i)
                const o2 = offset.offset(pos)
                expect(i).toEqual(o2)
                expect(pos).toEqual(offset.position(o2))
            }
        }
    })

    it('provides the right line range', () => {
        const texts = [
            `Hello
World
More`,
            `Hello
World
More
`,
        ]

        for (const text of texts) {
            const offset = new DocumentOffsets(text)

            expect(offset.getLine(0)).toEqual('Hello')
            expect(offset.getLine(1)).toEqual('World')
            expect(offset.getLine(2)).toEqual('More')
        }

        const offset = new DocumentOffsets(texts[1])
        expect(offset.getLine(3)).toEqual('')
    })
})
