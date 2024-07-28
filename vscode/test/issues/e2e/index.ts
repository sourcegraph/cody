import { test } from '../../e2e/helpers'

// TODO: There's no elegant way of getting if we're running `only` based test
// information from playwright. This is a ugly workaround.
const onlyTests = []

function patchOnly(obj: any) {
    const originalOnly = obj.only
    obj.only = function (...args) {
        onlyTests.push(args)
        return originalOnly.apply(this, args)
    }
}

const originalExtend = test.extend
test.extend = function (...args) {
    const res = originalExtend.apply(this, args)
    patchOnly(res)
    return res
}

patchOnly(test)

// biome-ignore lint/correctness/noEmptyPattern: <explanation>
test.beforeEach(async ({}, testInfo) => {
    // Unless marked by `.only` issue tests are skipped
    if (onlyTests.length === 0) {
        testInfo.skip(true, 'Issue tests are only ran if marked with `.only`')
    }
})

export { test }
