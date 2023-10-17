import { richClubsTotalBudget as generatedRichClubsTotalBudget } from './generate'
import { richClubsTotalBudget } from './solution'
import { Club } from './types'

const clubs: Club[] = [
    { name: 'Arsenal', budget: 80, league: 'premier' },
    { name: 'Manchester United', budget: 100, league: 'premier' },
    { name: 'Amesome Club', budget: 130, league: 'other' },
    { name: 'West Ham', budget: 40, league: 'premier' },
]

const expected = richClubsTotalBudget(clubs)
const actual = generatedRichClubsTotalBudget(clubs)
if (actual !== expected) {
    throw new Error(`Expected ${expected}, got ${actual}`)
}
