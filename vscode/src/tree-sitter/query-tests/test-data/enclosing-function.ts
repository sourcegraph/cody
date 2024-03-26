function wrapper() {
    console.log('wrapper')
    function test() {
        console.log('test')
        //     |
    }
}

// ------------------------------------

function testFunc() {
    //        |
    wrapper
}

// ------------------------------------

function testParameter(val) {
    //                 |
    wrapper
}

// ------------------------------------

function testKeyword(val) {
//  |
    wrapper
}

// ------------------------------------

function arrowWrapper() {
    const arrow = (value: string) => {
        console.log('hello')
        //  |
    }
}

// ------------------------------------

const arrowFunc = (value: string) => {
    console.log('hello')
    //  |
}

// ------------------------------------

class Agent {
    //   |
}

// ------------------------------------

class AgentConstructor {
    constructor() {
        console.log('hello')
        //   |
    }
}

// ------------------------------------

class AgentMethod {
    constructor() {}

    public sayHello() {
        console.log('hello')
        //   |
    }
}
