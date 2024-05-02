export interface Animal {
    name: string
    isMammal: boolean
}

export interface Selector {
    query(params: {isMammal: boolean, animalName: string}): {animals: Animal[]}
}

export const selector: Selector = {
    query(params) {
        return {
            animals: [{
                name: params.animalName,
                isMammal: params.isMammal
            }]
        }
    }
}


