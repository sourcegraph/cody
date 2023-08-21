import { describe, expect, it, vi } from 'vitest'

import { Typewriter } from './typewriter'

describe('TypeWriter', () => {
    it('closes the downstream consumer, no output', async () => {
        const update = vi.fn(() => {})
        const close = vi.fn(() => {})
        const tw = new Typewriter({
            update,
            close,
        })
        tw.close()
        await tw.finished
        expect(update).toHaveBeenCalledTimes(0)
        expect(close).toHaveBeenCalledTimes(1)
    })
    it('completes output before closing the downstream consumer', async () => {
        let lastText = ''
        const update = (s: string) => {
            lastText = s
        }
        const close = vi.fn(() => {})
        const tw = new Typewriter({
            update,
            close,
        })
        tw.update('hel')
        tw.update('hello world')
        tw.close()
        await tw.finished
        expect(lastText).toBe('hello world')
        expect(close).toHaveBeenCalledTimes(1)
    })
    it('breaks the output into typed "chunks"', async () => {
        let updateCallCount = 0
        const update = () => {
            updateCallCount++
        }
        const close = vi.fn(() => {})
        const tw = new Typewriter({
            update,
            close,
        })
        const message = 'i am the very model of a modern major general, of information animal, mineral and vegetable'
        tw.update(message)
        tw.close()
        await tw.finished
        // This doesn't test the heuristic very precisely but should catch
        // obvious issues like not breaking at all or very short chunks
        expect(updateCallCount).toBeGreaterThan(message.length / 20)
        expect(updateCallCount).toBeLessThan(message.length)
        expect(close).toHaveBeenCalledTimes(1)
    })
    it('supplies the output as successively longer strings', async () => {
        const lastUpdate = ''
        const update = (s: string) => {
            expect(s.slice(0, lastUpdate.length)).toEqual(lastUpdate)
        }
        const tw = new Typewriter({
            update,
            close: () => {},
        })
        const message = 'no matter how many white swans are found, it does not prove that there are no black swans'
        tw.update(message)
        tw.close()
        await tw.finished
    })
})
