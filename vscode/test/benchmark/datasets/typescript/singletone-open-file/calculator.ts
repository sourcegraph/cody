export class Calculator {
    constructor(private logger: { log: (data: any) => void }) {}
    public add(num1: number, num2: number): number {
        this.logger.log('add')
        return num1 + num2
    }

    public subtract(num1: number, num2: number): number {
        this.logger.log('subtract')
        return num1 - num2
    }

    public multiply(num1: number, num2: number): number {
        this.logger.log('multiply')
        return num1 * num2
    }

    public divide(num1: number, num2: number): number {
        this.logger.log('divide')
        return num1 / num2
    }
}
