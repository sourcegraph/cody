import { Person } from './types'

export function getAge(person: Person): number {
    const currentYear = new Date().getFullYear()
    return currentYear - person.yearOfBirth
}
