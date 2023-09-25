import { describe, it } from 'vitest'

import { BlazinglyFastGraph } from './bfg'

describe('bfg', () => {
    it('is super fast', async () => {
        const bfg = new BlazinglyFastGraph()
        await bfg.initialize({})
        await bfg.didRevisionChange('file:///Users/olafurpg/dev/sourcegraph/sourcegraph/.git')
        await bfg.shutdown(void {})
    })
})
