import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function loadSelects(client) {
    const selectsDir = path.join(process.cwd(), 'src', 'selects');

    // Cria a pasta automaticamente se ela não existir
    if (!fs.existsSync(selectsDir)) {
        fs.mkdirSync(selectsDir, { recursive: true });
        console.log('📁 [Sistema] Pasta de selects criada automaticamente.');
        return;
    }

    const selectFiles = fs.readdirSync(selectsDir).filter(file => file.endsWith('.js'));
    
    for (const file of selectFiles) {
        const filePath = path.join(selectsDir, file);
        const select = await import(pathToFileURL(filePath).href);
        if (select.default && select.default.data) {
            client.selects.set(select.default.data.name, select.default);
        }
    }
}