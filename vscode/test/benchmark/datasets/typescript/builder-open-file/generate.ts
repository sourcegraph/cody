import { Vehicle, VehicleBuilder } from './vehicleBuilder'

interface CarConfig extends Vehicle {
    make: string
    model: string
}

export function createCar(config: CarConfig): Vehicle {█
