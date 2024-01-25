const foo = 42

export class TestClass {
    constructor(private shouldGreet: boolean) {}

    public functionName() {
        if (this.shouldGreet) {
            console.log(/* CURSOR */ 'Hello World!')
        }
    }
}
