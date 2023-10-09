import { fetchCurrentUser, fetchUser } from './api'
import { Person } from './types'

export async function getUser(): Promise<Person> {
    const person = await fetchCurrentUser()
    return person
}
