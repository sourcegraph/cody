import { Color } from './basic-types'

export interface SquareConfig {
    color?: Color;
    width?: number;
}

export interface Background {
    items: Square[]
    name: string
}

export interface Square {
    color: Color
    area: number
}

export interface VersionedSquare extends Square {
    version: number
}

export function createSquare(config: SquareConfig, version?: number): VersionedSquare
export function createSquare(config: SquareConfig, metadata?: Record<string,number>): VersionedSquare
export function createSquare(config: SquareConfig): { color: Color; area: number } {
    let newSquare = { color: Color.Blue, area: 100 } as Square;
    if (config.color) {
        newSquare.color = config.color as Color
    }
    if (config.width) {
        newSquare.area = config.width * config.width;
    }
    return newSquare;
}
