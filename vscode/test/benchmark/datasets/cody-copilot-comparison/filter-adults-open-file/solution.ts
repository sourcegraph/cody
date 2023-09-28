import { User } from './user'

function filterAdults(users: User[]): User[] {
    return users.filter(user => user.age >= 18)
}
