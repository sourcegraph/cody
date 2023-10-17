import { getEquipment } from './generate'

const result = getEquipment('hockey')
const expectedResult = 'puck'
if (result !== expectedResult) {
    throw new Error(`Incorrect result. Expected: ${expectedResult}, got: ${result}`)
}
