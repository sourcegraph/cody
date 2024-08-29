/** @type {import('@openctx/client').Provider} */
const provider = {
    meta() {
        return { name: 'mention readme', items: {}, mentions: { label: 'Include readme' } }
    },
    annotations(params) {
        return [{ item: { title: 'hello world' }, uri: params.uri }]
    },
    mentions(params) {
        if (params.query.includes('typescript')) {
            return [
                {
                    title: 'Readme for TypeScript',
                    uri: 'file:///Users/sqs/src/github.com/sourcegraph/cody/README.md',
                    description: 'hello',
                },
            ]
        }
        if (params.query.includes('javascript')) {
            return [
                {
                    title: 'Readme for JavaScript',
                    uri: 'file:///Users/sqs/src/github.com/sourcegraph/cody/README.md',
                    description: 'hello',
                },
            ]
        }
        return []
    },
    items(mention) {
        const data = require('node:fs')
            .readFileSync('/Users/sqs/src/github.com/sourcegraph/cody/README.md', 'utf8')
            .toString()
        return [{ title: mention.mention?.title, ai: { content: data } }]
    },
}

export default provider
