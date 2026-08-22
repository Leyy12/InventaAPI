const fs = require('fs');
const path = require('path');

const dir = 'routes';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js')).map(f => path.join(dir, f));

for (const file of files) {
    let content = fs.readFileSync(file, 'utf8');
    if (content.includes('function getFirestore() {')) {
        // rename function definition
        content = content.replace(/function getFirestore\(\) \{/g, 'function getDb() {');
        // replace function calls that access properties e.g. getFirestore().collection
        content = content.replace(/getFirestore\(\)\./g, 'getDb().');
        fs.writeFileSync(file, content);
        console.log(`Fixed ${file}`);
    }
}
