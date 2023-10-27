import { User } from './types'
import rawUsers from './users.json'
import { getAge } from './utils'

export function parseUsers(): User[] {
    return rawUsers.map(user => ({
        fullName: `${user.firstName} ${user.lastName}`,
        age: getAge(user.birthDate),
    }))
}
