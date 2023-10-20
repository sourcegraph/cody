import { calculator } from './generate'
import { Logger } from './logger'

const sum = calculator.add(2, 4)
const double = calculator.multiply(sum, 2)
const expected = 12
if (double !== expected) {
    throw new Error(`Expected ${expected}, got ${double}`)
}

const expectedHistoryLength = 2
if (Logger.getInstance().history.length !== expectedHistoryLength) {
    throw new Error(`Expected ${expectedHistoryLength}, got ${Logger.getInstance().history.length}`)
}
