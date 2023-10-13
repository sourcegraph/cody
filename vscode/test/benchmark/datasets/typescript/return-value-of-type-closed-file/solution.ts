import { Equipment, Sport } from './types'

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
