import { Rectangle as GeneratedRectangle } from './generate'
import { Rectangle } from './solution'

const generatedRect = new GeneratedRectangle(10, 10, 1)
const rect = new Rectangle(10, 10, 1)
if (generatedRect.area !== rect.area) {
    throw new Error(`Expected ${rect.area}, got ${generatedRect.area}`)
}
