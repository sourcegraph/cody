interface Person {
    name: string
    age: number
}/* CURSOR */

export function sumAge(humanA: Human, humanB: Human): number {
    return humanA.age + humanB.age
}
