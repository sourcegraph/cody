interface Person {
    name: string
    age: █
}

export function createPerson(name: string, birthYear: number): Person {
    return { name, age: `${new Date().getFullYear() - birthYear} years old` }
}
