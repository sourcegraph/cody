import { Fuel } from './types'
import { Vehicle, VehicleBuilder } from './vehicleBuilder'

interface CarConfig extends Vehicle {
    make: string
    model: string
    fuel: Fuel
}

export function createCar(config: CarConfig): Vehicle {
    const builder = new VehicleBuilder()
    builder.setType('car')
    builder.setMake(config.make)
    builder.setModel(config.model)
    builder.setFuel(config.fuel)
    return builder.build()
}
