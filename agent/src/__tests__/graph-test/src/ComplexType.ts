interface A {
    a: string
    myComplexClass: ComplexClass
}
interface B extends A {
    b: number
}
interface C {
    c: boolean
    c2: boolean
}

interface D {
    d: B
    d2: (a: number, b: number) => number
    d3(c: string, d: string): string
}
export type ComplexType = Omit<A & C, 'c2'>

export type AliasD = D

export interface ComplexInterface extends Omit<A & C, 'c2'>, AliasD {
    complex: Record<string, number>
}

export class ComplexClass {
    constructor(
        public a: Record<string, number>,
        public b: string,
        public c: (c: string, d: string) => string,
        private d: {
            a: string
            b: number
        }
    ) {
        // This is a command
    }

    public static create(): ComplexClass {
        return new ComplexClass(
            {
                a: 1,
                b: 2,
            },
            'a',
            (c, d) => c + d,
            {
                a: '',
                b: 2,
            }
        )
    }
}

export function complexFunction(): string {
    return 'complex'
}
