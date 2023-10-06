interface Person {
    name: string
    age: number
    createdAt: number
}

export function createPerson(fullName: string, yearsOld: number): Person {
    return { name: fullName, age: yearsOld, createdAt: Date.now() }
}
