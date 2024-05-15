export function nextTick() {
    return new Promise(resolve => process.nextTick(resolve))
}
