import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function loadModals(client) {
    const modalsDir = path.join(process.cwd(), 'src', 'modals');

    // Cria a pasta automaticamente se ela não existir
    if (!fs.existsSync(modalsDir)) {
        fs.mkdirSync(modalsDir, { recursive: true });
        console.log('📁 [Sistema] Pasta de modais criada automaticamente.');
        return;
    }

    const modalFiles = fs.readdirSync(modalsDir).filter(file => file.endsWith('.js'));
    
    for (const file of modalFiles) {
        const filePath = path.join(modalsDir, file);
        const modal = await import(pathToFileURL(filePath).href);
        if (modal.default && modal.default.data) {
            client.modals.set(modal.default.data.name, modal.default);
        }
    }
}