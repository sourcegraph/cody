export type Sport = 'football' | 'hockey'
export type Equipment = 'ball' | 'puck'


export function getEquipment(sport: Sport): Equipment {
    switch (sport) {
        case 'football':
            return 'ball'
        case 'hockey':
            return 'puck'
        default:
            throw new Error(`Unknown sport: ${sport}`)
    }
}
