export class Rectangle {
    constructor(
        private _height: number,
        private _width: number,
        private _borderWidth: number
    ) {}

    get area(): number {
        return this.calcArea()
    }

    get width(): number {
        return this._width + this._borderWidth * 2
    }

    get height(): number {
        return this._height + this._borderWidth * 2
    }

    calcArea(): number {
        return this.width * this.height
    }
}
