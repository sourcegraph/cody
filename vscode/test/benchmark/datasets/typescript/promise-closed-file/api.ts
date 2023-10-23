import { Person, User } from './types'

export function fetchUser(): Promise<Person> {
    return Promise.resolve({
        name: 'John',
        age: 30,
        createdAt: Date.now(),
    })
}

export function fetchCurrentUser(): Promise<User> {
    return Promise.resolve({
        id: 'uuid-1',
    })
}
