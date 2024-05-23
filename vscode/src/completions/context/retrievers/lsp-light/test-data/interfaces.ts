import { Color } from './basic-types'
import { SquareConfig, createSquare } from './squares';

export interface LabelledValue {
    label: string;
}

/**
 * Test documentation block
 */
export function printLabelAndSquare(labelledObj: LabelledValue): SquareConfig {
    printLabel(labelledObj)
    return createSquare({ color: Color.Red, width: 100 })
}

export function printLabel(labelledObj: LabelledValue): void {
    console.log('label', labelledObj)
}
