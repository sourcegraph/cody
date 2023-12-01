import * as commander from 'commander'

export function booleanOption(value: string): boolean {
    return value === 'true'
}

export function intOption(value: string): number {
    const parsedValue = Number.parseInt(value, 10)
    if (isNaN(parsedValue)) {
        throw new commander.InvalidArgumentError('Not a number.')
    }
    return parsedValue
}

export function arrayOption<T>(value: T, previous: T[]): T[] {
    return previous.concat([value])
}
