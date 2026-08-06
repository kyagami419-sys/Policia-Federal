import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function loadButtons(client) {
    const buttonsDir = path.join(process.cwd(), 'src', 'components', 'buttons');

    // Cria a pasta automaticamente se ela não existir
    if (!fs.existsSync(buttonsDir)) {
        fs.mkdirSync(buttonsDir, { recursive: true });
        console.log('📁 [Sistema] Pasta de botões criada automaticamente.');
        return;
    }

    const buttonFiles = fs.readdirSync(buttonsDir).filter(file => file.endsWith('.js'));
    
    for (const file of buttonFiles) {
        const filePath = path.join(buttonsDir, file);
        const button = await import(pathToFileURL(filePath).href);
        if (button.default && button.default.data) {
            client.buttons.set(button.default.data.name, button.default);
        }
    }
}