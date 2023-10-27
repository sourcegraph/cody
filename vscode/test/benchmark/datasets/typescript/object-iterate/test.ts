import { getStringValues } from './generate'

const actual = getStringValues({ firstName: 'John', lastName: 'Doe', age: 30 })
if (actual.length !== 2 || !actual.includes('John') || !actual.includes('Doe')) {
    throw new Error('Incorrect result')
}
