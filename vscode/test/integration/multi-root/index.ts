import * as runner from '../runner'

export function run(): Promise<void> {
    return runner.run(__dirname)
}
