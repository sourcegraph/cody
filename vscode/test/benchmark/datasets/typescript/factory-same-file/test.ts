import { shapeFactory } from './generate'

const rect = shapeFactory.createShape(2, 4)
const perimeter = rect!.calcPerimeter()
const expected = 12
if (perimeter !== expected) {
    throw new Error(`Expected ${expected}, got ${perimeter}`)
}
