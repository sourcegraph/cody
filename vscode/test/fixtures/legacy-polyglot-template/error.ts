// @ts-nocheck
const logNumber = (number: number) => {
    console.log('What a great number!', number)
}

const hasError = () => {
    const numbers = [1, 2, '3', 4, 5]
    numbers.forEach(logNumber)
}
