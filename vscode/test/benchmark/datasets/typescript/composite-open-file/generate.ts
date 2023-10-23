import { CompoundOrgan } from './compoundOrgan'
import { SimpleOrgan } from './simpleOrgan'
import { Deparmtent, Person } from './types'
import { getFullName } from './utils'

export function createCompany(company: { name: string; ceo: Person; departments: Deparmtent[] }): CompoundOrgan {█
