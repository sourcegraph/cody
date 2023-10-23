import { CompoundOrgan } from './compoundOrgan'
import { createCompany } from './generate'
import { findChild, getFullName } from './utils'

const COMPANY_NAME = 'Company ABC'
const CEO = {
    firstName: 'John',
    lastName: 'Superman',
    level: 1,
}
const DEPARTMENTS = [
    {
        name: 'Finance',
        manager: { firstName: 'Marry', lastName: 'Smith', level: 2 },
        employees: [
            { firstName: 'Arnold', lastName: 'Wilson', level: 3 },
            { firstName: 'Jane', lastName: 'Brown', level: 4 },
        ],
    },
    {
        name: 'IT',
        manager: { firstName: 'Jack', lastName: 'Hacker', level: 2 },
        employees: [
            { firstName: 'Simon', lastName: 'Awesome', level: 4 },
            { firstName: 'Jenny', lastName: 'Great', level: 3 },
        ],
    },
]

const company = createCompany({ name: COMPANY_NAME, ceo: CEO, departments: DEPARTMENTS })

if (!findChild(company, getFullName(CEO))) {
    throw new Error(`Expected to have CEO "${getFullName(CEO)}"`)
}

for (const dep of DEPARTMENTS) {
    const department = findChild(company, dep.name) as CompoundOrgan | undefined
    if (!department) {
        throw new Error(`Expected to have department "${dep.name}".`)
    }
    if (!findChild(department, getFullName(dep.manager))) {
        throw new Error(`Expected to have manager "${getFullName(dep.manager)}".`)
    }
    for (const employee of dep.employees) {
        if (!findChild(department, getFullName(employee))) {
            throw new Error(`Expected to have employee "${getFullName(employee)}".`)
        }
    }
}
