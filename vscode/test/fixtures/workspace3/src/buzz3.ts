export function fizzbuzz() {
    const fizzbuzz = []
    for (let i = 1; i <= 100; i++) {
        if (i % 15 === 0) {
            fizzbuzz.push('FizzBuzz')
        } else if (i % 3 === 0) {
            fizzbuzz.push('Fizz')
        } else if (i % 5 === 0) {
            fizzbuzz.push('Buzz')
        } else {
            fizzbuzz.push(i.toString())
        }
    }
    return fizzbuzz
}
