import { A, B, C } from './All'
import { selector, Selector } from './members'

export const getter: {
    a: A,
    b: B,
    c: C,
    indirect(): Selector
} = {indirect: () => selector, a: {a: 'a'}, b: {a: 'b'}, c: {a: 'c'}}
