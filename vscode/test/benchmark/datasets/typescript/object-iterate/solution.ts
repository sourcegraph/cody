export function getStringValues(obj: Record<string, any>): string[] {
    const result: string[] = []
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const value = obj[key]
            if (typeof value === 'string') {
                result.push(value)
            }
        }
    }
    return result
}
