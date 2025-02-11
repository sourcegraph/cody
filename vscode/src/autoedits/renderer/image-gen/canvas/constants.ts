import type { DiffColors } from './types'

export const DIFF_COLORS = {
    inserted: {
        line: 'rgba(155, 185, 85, 0.1)',
        text: 'rgba(155, 185, 85, 0.15)',
    },
    removed: {
        line: 'rgba(255, 0, 0, 0.1)',
        text: 'rgba(255, 0, 0, 0.15)',
    },
} satisfies DiffColors
