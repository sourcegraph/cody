import { Person } from './types'

// TODO: Figure out why it throws "generate.ts(1,24): error TS2307: Cannot find module './types' or its corresponding type declarations." when completion is correct
export function getSummary(person: Person): string {
    const █
    return `User ${name}, ${age} years old, was created on ${new Date(createdAt).toLocaleDateString()}.`
}
