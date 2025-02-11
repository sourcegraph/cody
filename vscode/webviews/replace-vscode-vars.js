const fs = require('fs');
const path = require('path');

const replacements = {
    '--vscode-sideBar-foreground': '--text',
    '--vscode-widget-shadow': '--background-03',
    '--vscode-dropdown-border': '--border',
    '--vscode-input-background': '--background-02',
    '--vscode-inputOption-activeForeground': '--text-primary',
    '--vscode-inputOption-activeBackground': '--background-01',
    '--vscode-inputOption-activeBorder': '--border-active',
};

function replaceInFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    Object.entries(replacements).forEach(([oldVar, newVar]) => {
        const regex = new RegExp(`var\\(${oldVar}\\)`, 'g');
        content = content.replace(regex, `var(${newVar})`);
    });
    
    fs.writeFileSync(filePath, content);
}

function processDirectory(dir) {
    const files = fs.readdirSync(dir);
    
    files.forEach(file => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
            processDirectory(fullPath);
        } else if (file.endsWith('.module.css')) {
            replaceInFile(fullPath);
        }
    });
}

// Start processing from the lib directory
processDirectory('/Users/danielmarques/dev/cody/lib');
