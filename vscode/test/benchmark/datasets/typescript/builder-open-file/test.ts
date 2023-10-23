import { createCar } from './generate'

const car = createCar({ make: 'Audi', model: 'A4', fuel: 'petrol', gearbox: 'manual' })

if (car.type !== 'car') {
    throw new Error(`Expected "type" to be "car", got "${car.type}"`)
}

if (car.make !== 'audi') {
    throw new Error(`Expected "type" to be "audi", got "${car.make}"`)
}

if (car.model !== 'a4') {
    throw new Error(`Expected "type" to be "a4", got "${car.model}"`)
}

if (car.fuel !== 'petrol') {
    throw new Error(`Expected "type" to be "petrol", got "${car.fuel}"`)
}

if (car.gearbox !== 'manual') {
    throw new Error(`Expected "type" to be "manual", got "${car.gearbox}"`)
}
