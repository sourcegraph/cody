type ShapeType = 'triangle' | 'rectangle' | 'circle'

export abstract class Shape {
    constructor(public name: ShapeType) {}

    public abstract calcPerimeter(): number
}

class Triangle extends Shape {
    constructor(private sides: number[]) {
        super('triangle')
    }

    calcPerimeter(): number {
        return this.sides[0] + this.sides[1] + this.sides[2]
    }
}

class Rectangle extends Shape {
    constructor(private sides: number[]) {
        super('rectangle')
    }

    calcPerimeter(): number {
        return (this.sides[0] + this.sides[1]) * 2
    }
}

class Circle extends Shape {
    constructor(private radius: number) {
        super('circle')
    }

    calcPerimeter(): number {
        return 2 * Math.PI * this.radius
    }
}

interface ShapeFactory {
    createShape(...sides: number[]): Shape
}

export const shapeFactory: ShapeFactory = {
    createShape(...sides: number[]) {
        switch (sides.length) {
            case 3:
                return new Triangle(sides as [number, number, number])
            case 2:
                return new Rectangle(sides as [number, number])
            case 1:
                return new Circle(sides[0])
            default:
                throw new Error(`Can't create a shape from sides: "[${sides.join()}]"`)
        }
    },
}
