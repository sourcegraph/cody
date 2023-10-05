import { Banana } from './banana'

export function sum({ banana1, bananaDoes }: { banana1: Banana; bananaDoes: Banana }): number {
    return banana1.x + bananaDoes.z
}
