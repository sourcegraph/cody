interface Person {
    name: string
    age: string
}

export function createPerson(name: string, birthYear: number): Person {
    return { name, age: `${new Date().getFullYear() - birthYear} years old` }
}
