import { User } from "./user"

export interface Car {
    modelYear: number
    vanityItem: boolean
    user: User
}

export function isNewCar(car: Car, params: { minimumYear: number }): boolean {
    return car.modelYear > params.minimumYear
}
