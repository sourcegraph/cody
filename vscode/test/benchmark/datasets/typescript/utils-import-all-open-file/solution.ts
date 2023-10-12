import { Club } from './types'
import * as utils from './utils'

export function richClubsTotalBudget(clubs: Club[]): number {
    return utils.totalBudget(clubs.filter(c => utils.isRich(c)))
}
