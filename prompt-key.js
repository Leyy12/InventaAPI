const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log("==========================================");
console.log("   FIREBASE SERVICE ACCOUNT REPLACER      ");
console.log("==========================================");
console.log("Huwag i-paste ang text ng key. I-paste ang BUONG PATH kung saan naka-save");
console.log("ang bagong download na JSON file (halimbawa: C:\\Users\\ACER\\Downloads\\inventaapi-firebase-adminsdk-xxxxx.json)");

rl.question('\nI-paste ang file path dito: ', (sourcePath) => {
    // Alisin ang quotes kung meron (sasagot sa tanong mo!)
    sourcePath = sourcePath.replace(/^["']|["']$/g, '').trim();

    try {
        if (!fs.existsSync(sourcePath)) {
            console.error(`\n❌ ERROR: Hindi mahanap ang file sa path na: ${sourcePath}`);
            console.error("Pakisigurado na tama ang path at nandiyan pa ang file.");
            process.exit(1);
        }

        const content = fs.readFileSync(sourcePath, 'utf8');
        const lines = content.split('\n');
        
        console.log(`\n--- UNANG 5 LINYA NG FILE NA NABASA ---`);
        console.log(lines.slice(0, 5).join('\n'));
        console.log(`---------------------------------------\n`);

        const json = JSON.parse(content);
        console.log(`Nabasa ang file. Project ID: ${json.project_id}`);

        if (json.project_id !== 'inventaapi') {
            console.error(`\n❌ ERROR: Ang file na ito ay para sa project na '${json.project_id}'.`);
            console.error("Kailangan natin ang file para sa 'inventaapi'. Paki-download ang tamang file mula sa Firebase Console.");
            process.exit(1);
        }

        const destPath = path.join(__dirname, 'service-account.json');
        fs.writeFileSync(destPath, content, 'utf8');
        console.log(`\n✅ SUCCESS: Na-copy at na-overwrite ang service-account.json!`);
        console.log(`Puwede mo nang sabihin sa akin (kay Antigravity) na na-run mo na ito.`);
        
    } catch (err) {
        console.error('\n❌ ERROR:', err.message);
    } finally {
        rl.close();
    }
});
