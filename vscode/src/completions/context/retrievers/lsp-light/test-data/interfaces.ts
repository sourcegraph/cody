export interface LabelledValue {
    label: string;
}

/**
 * Test documentation block
 */
export function printLabel(labelledObj: LabelledValue) {
    console.log('kek');
}

export interface SquareConfig {
    color?: string;
    width?: number;
}

export function createSquare(config: SquareConfig): { color: string; area: number } {
    let newSquare = { color: "white", area: 100 };
    if (config.color) {
        newSquare.color = config.color;
    }
    if (config.width) {
        newSquare.area = config.width * config.width;
    }
    return newSquare;
}
