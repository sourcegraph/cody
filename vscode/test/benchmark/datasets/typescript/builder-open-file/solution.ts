import { Vehicle, VehicleBuilder } from './vehicleBuilder'

interface CarConfig extends Vehicle {
    make: string
    model: string
}

export function createCar(config: CarConfig): Vehicle {
    const builder = new VehicleBuilder()
    builder.setType('car')
    builder.setMake(config.make)
    builder.setModel(config.model)
    if (config.modification) {
        builder.setModification(config.modification)
    }
    if (config.bodyType) {
        builder.setBodyType(config.bodyType)
    }
    if (config.fuel) {
        builder.setFuel(config.fuel)
    }
    if (config.gearbox) {
        builder.setGearbox(config.gearbox)
    }
    return builder.build()
}
