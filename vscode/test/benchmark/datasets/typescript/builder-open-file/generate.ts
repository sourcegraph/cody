import { Fuel } from './types'
import { Vehicle, VehicleBuilder } from './vehicleBuilder'

interface CarConfig extends Vehicle {
    make: string
    model: string
    fuel: Fuel
}

export function createCar(config: CarConfig): Vehicle {█
