import { CompoundOrgan } from './compoundOrgan'
import { Organ } from './organ'
import { Person } from './types'

export function getFullName(person: Person): string {
    return `${person.firstName} ${person.lastName}`
}

export function findChild(organ: CompoundOrgan, childName: string): Organ | undefined {
    return organ.children.find(child => {
        if ('name' in child) {
            return child.name === childName
        }
        return undefined
    })
}
