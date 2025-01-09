export function cssPropertiesToString(properties: object): string {
    return Object.entries(properties)
        .map(([key, value]) => `${key}: ${value};`)
        .join('')
}
