import { filterAdults } from './generate'
import { User } from './user'

const sampleUsers: User[] = [
    { id: 1, name: 'Alice', age: 15 },
    { id: 2, name: 'Bob', age: 22 },
    { id: 3, name: 'Charlie', age: 18 },
]

const result = filterAdults(sampleUsers)
if (result.length !== 2) {
    throw new Error('Incorrect number of adults filtered.')
}
if (result.some(user => user.age < 18)) {
    throw new Error('Filtered list contains non-adult.')
}
