import { Club } from './types'
import { isRich, totalBudget } from './utils'

export function richClubsTotalBudget(clubs: Club[]): number {
    return totalBudget(clubs.filter(isRich))
}
