import { CompoundOrgan } from './compoundOrgan'
import { SimpleOrgan } from './simpleOrgan'
import { Deparmtent, Person } from './types'
import { getFullName } from './utils'

export function createCompany(company: { name: string; ceo: Person; departments: Deparmtent[] }): CompoundOrgan {
    const companyOrgan = new CompoundOrgan(company.name)
    companyOrgan.add(new SimpleOrgan(getFullName(company.ceo)))
    for (const department of company.departments) {
        const departmentOrgan = new CompoundOrgan(department.name)
        companyOrgan.add(departmentOrgan)
        departmentOrgan.add(new SimpleOrgan(getFullName(department.manager)))
        for (const employee of department.employees) {
            departmentOrgan.add(new SimpleOrgan(getFullName(employee)))
        }
    }
    return companyOrgan
}
