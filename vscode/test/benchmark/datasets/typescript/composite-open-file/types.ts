import { CompoundOrgan } from './compoundOrgan'

export interface Person {
    firstName: string
    lastName: string
    level: number
}

export interface Deparmtent {
    name: string
    manager: Person
    employees: Person[]
}

export interface Company {
    name: string
    ceo: Person
    departments: CompoundOrgan[]
}
