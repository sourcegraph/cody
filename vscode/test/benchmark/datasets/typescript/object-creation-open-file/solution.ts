import { Person } from './types'

export function createPerson(fullName: string, yearsOld: number): Person {
    return { name: fullName, age: yearsOld, createdAt: Date.now() }
}
