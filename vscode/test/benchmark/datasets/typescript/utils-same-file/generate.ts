import { Club } from "./types";

function isRich(club: Club): boolean {
    return club.budget > 70
}

function isTop(club: Club): boolean {
    return club.league === 'premier'
}

function totalBudget(clubs: Club[]): number {
    return clubs.reduce((acc, c) => (acc += c.budget), 0)
}

export function richClubsTotalBudget(clubs: Club[]): number {
    return █
}
