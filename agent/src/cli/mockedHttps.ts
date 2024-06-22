const https = require('node:https')
export default {
    request: (a: any, b: any, c: any) => {
        console.log({ a, b, c })
        return https.request(a, b, c)
    },
}
