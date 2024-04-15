// nullable numbers are considered unsafe by default
let num: number | undefined = 0
if (num) {
    console.log('num is defined')
}

// nullable strings are considered unsafe by default
let str: string | null = null
if (!str) {
    console.log('str is empty')
}

// nullable booleans are considered unsafe by default
function foo(bool?: boolean) {
    if (bool) {
        bar()
    }
}

// `any`, unconstrained generics and unions of more than one primitive type are disallowed
const foo = <T>(arg: T) => (arg ? 1 : 0)

// always-truthy and always-falsy types are disallowed
let obj = {}
while (obj) {
    obj = getObj()
}
