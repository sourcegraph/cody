import { fetchCurrentUser, fetchUser } from './api'
import { Person } from './types'

export async function getUser(): Promise<Person> {
    const person = await fetchUser()
    return person
}
