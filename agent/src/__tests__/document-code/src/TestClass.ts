const foo = 42
// Should be present in the LLM prompt
const longPrefix = `
    longPrefix content
    longPrefix content
    longPrefix content
    longPrefix content
    longPrefix content
    longPrefix content
    longPrefix content
`

export class TestClass {
    constructor(private shouldGreet: boolean) {}

    public functionName() {
        if (this.shouldGreet) {
            console.log(/* CURSOR */ 'Hello World!')
        }
    }
}

// Should be present in the LLM prompt
const longSuffix = `
    longSuffix content
    longSuffix content
    longSuffix content
    longSuffix content
    longSuffix content
    longSuffix content
    longSuffix content
`
