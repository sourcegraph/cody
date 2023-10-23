import { Club } from './types'

export function isRich(club: Club): boolean {
    return club.budget > 70
}

export function isTop(club: Club): boolean {
    return club.league === 'premier'
}

export function totalBudget(clubs: Club[]): number {
    return clubs.reduce((acc, c) => (acc += c.budget), 0)
}
