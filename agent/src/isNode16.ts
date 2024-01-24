export function isNode16(): boolean {
    const [major] = process.versions.node.split('.')
    return Number.parseInt(major, 10) <= 16
}
