import { chatAction } from '../../cli/src/chat'

async function main(): Promise<void> {
    const options = await chatAction({
        endpoint: 'https://sourcegraph.com',
        accessToken: 'blah',
        dir: process.cwd(),
        debug: false,
        message: 'What color is the sky?',
        showContext: false,
    })
    console.log(options)
}
main()
