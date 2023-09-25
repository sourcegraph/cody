import { describe, expect, it } from 'vitest'
import { BlazinglyFastGraph } from './bfg'

describe('bfg', () => {
    it('is super fast', async () => {
        const bfg = new BlazinglyFastGraph()
        await bfg.initialize({});
        await bfg.didRevisionChange("file:///Users/auguste.rame/Documents/Repos/sourcegraph/.git")
        await bfg.shutdown(void{});
    })
})
