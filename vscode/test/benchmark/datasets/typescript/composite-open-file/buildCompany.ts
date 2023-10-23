import { CompoundOrgan } from './compoundOrgan'
import { SimpleOrgan } from './simpleOrgan'
import { Company } from './types'
import { getFullName } from './utils'

export function buildCompany(config: Company): CompoundOrgan {
    const company = new CompoundOrgan(config.name)
    company.add(new SimpleOrgan(getFullName(config.ceo)))
    for (const department of config.departments) {
        company.add(department)
    }
    return company
}
