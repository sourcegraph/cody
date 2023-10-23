import { CompoundOrgan } from './compoundOrgan'
import { SimpleOrgan } from './simpleOrgan'
import { Deparmtent } from './types'
import { getFullName } from './utils'

export function buildDepartment(config: Deparmtent) {
    const department = new CompoundOrgan(config.name)
    department.add(new SimpleOrgan(getFullName(config.manager)))
    for (const employee of config.employees) {
        department.add(new SimpleOrgan(getFullName(employee)))
    }
    return department
}
