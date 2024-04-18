function wrapper() {
    console.log('wrapper')
    function test() {
        //     |
        console.log('test')
    }
}

// ------------------------------------

function testFunc() {
    //        |
    wrapper
}

// ------------------------------------

function testKeyword(val) {
    // |
    wrapper
}

// ------------------------------------

class AgentConstructor {
    constructor() {
        //   |
        console.log('hello')
    }
}

// ------------------------------------

class AgentMethod {
    constructor() {}

    public sayHello() {
        //   |
        console.log('hello')
    }
}
