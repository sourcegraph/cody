import { BodyType, Fuel, Gearbox, VehicleType } from './types'

export class Vehicle {
    public type?: VehicleType
    public make?: string
    public model?: string
    public modification?: string
    public bodyType?: BodyType
    public fuel?: Fuel
    public gearbox?: Gearbox
}

interface IVehicleBuilder {
    setType(type: VehicleType): void
    setMake(make: string): void
    setModel(model: string): void
    setModification(modification: string): void
    setBodyType(bodyType: string): void
    setFuel(fuel: Fuel): void
    setGearbox(gearboxType: Gearbox): void
    build(): Vehicle
}

export class VehicleBuilder implements IVehicleBuilder {
    private vehicle: Vehicle

    constructor() {
        this.vehicle = new Vehicle()
    }

    setType(type: VehicleType): void {
        this.vehicle.type = type
    }

    setMake(make: string) {
        this.vehicle.make = make.trim().toLowerCase()
    }

    setModel(model: string) {
        this.vehicle.model = model.trim().toLowerCase()
    }

    setModification(modification: string) {
        this.vehicle.modification = modification.trim().toLowerCase()
    }

    setBodyType(bodyType: BodyType) {
        this.vehicle.bodyType = bodyType
    }

    setFuel(fuel: Fuel) {
        this.vehicle.fuel = fuel
    }

    setGearbox(gearbox: Gearbox) {
        this.vehicle.gearbox = gearbox
    }

    build(): Vehicle {
        return this.vehicle
    }
}
