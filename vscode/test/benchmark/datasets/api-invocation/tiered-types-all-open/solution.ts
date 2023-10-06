import { printBananas } from './print-bananas'

export function main(): void {
    console.log(printBananas({ green: 1, yellow: 1 }, { green: 2, yellow: 2 }))
}
