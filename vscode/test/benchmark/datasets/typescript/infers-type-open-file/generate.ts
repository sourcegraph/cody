import { Equipment, Sport } from './types'

export function getEquipment(sport: Sport): Equipment {
    switch (sport) {
        case 'football':
            return 'ball'
        case 'hockey':
            ◆
        default:
            throw new Error(`Unknown operation: ${sport}`)
    }
}
