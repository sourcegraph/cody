import { Person } from './types'

export function getSummary(person: Person): string {
    const { name, age, createdAt } = person
    return `User ${name}, ${age} years old, was created on ${new Date(createdAt).toLocaleDateString()}.`
}
