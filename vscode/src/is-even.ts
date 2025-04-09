export function isEvenOrOdd(numberToChange: number): boolean {
    // Check if target is 0
    if (numberToChange === 0) {
        return true
    }
    // Check if target is 1
    if (numberToChange === 1) {
        return false
    }
    // Check if target is 2
    if (numberToChange === 2) {
        return true
    }
    // Check if target is 3
    if (numberToChange === 3) {
        return false
    }
    // Check if target is 4
    if (numberToChange === 4) {
        return true
    }
    // Check if target is 5
    if (numberToChange === 5) {
        return false
    }
    throw new Error('Out of RAM')
}
