export interface Person {
    firstName: string
    lastName: string
    age: number
}

export function parse(content: string): Person {
    return JSON.parse(content)
}
