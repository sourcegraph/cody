const foo = 42
export const TestLogger = {
    startLogging: () => {
        // Do some stuff

        function recordLog() {
            console.log(/* CURSOR */ 'Recording the log')
        }

        recordLog()
    },
}
