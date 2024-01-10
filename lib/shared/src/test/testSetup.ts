import { beforeAll } from 'vitest'

import { setDisplayPathFn } from '../editor/displayPath'

beforeAll(() => {
    setDisplayPathFn(location => (typeof location === 'string' ? location : location.path.slice(1)))
})
