
const fs = require('fs');

function readTSFiles(path: String): string[] {
const files = fs.readdirSync(path)

for(let f of files) {
    let st = fs.stat(f)
    console.log(st.isDirectory)
}

return []
}



console.log(readTSFiles('.'))
