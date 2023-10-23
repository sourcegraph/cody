import { areSame } from './generate'

;(async () => {
    const obj1 = { a: 1, b: 2 }
    const obj2 = { a: 1, b: 2 }
    const expected = true
    const actual = await areSame(obj1, obj2)
    if (actual !== expected) {
        throw new Error(`Expected to be ${expected}, but got ${actual}`)
    }
})()
