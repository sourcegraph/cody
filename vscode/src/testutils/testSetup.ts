import { beforeEach } from 'vitest'

import { setDisplayPathFn } from '@sourcegraph/cody-shared'

beforeEach(() => {
    setDisplayPathFn(location => (typeof location === 'string' ? location : location.path.slice(1)))
})
