import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function loadButtons(client) {
    const buttonsDir = path.join(process.cwd(), 'src', 'components', 'buttons');

    // Se a pasta não existir, apenas encerra sem dar erro
    if (!fs.existsSync(buttonsDir)) {
        console.log('⚠️ [AVISO] A pasta de botões não existe. Ignorando.');
        return;
    }

    // Verifica se o caminho é realmente um diretório
    const stats = fs.statSync(buttonsDir);
    if (!stats.isDirectory()) {
        console.log('⚠️ [AVISO] O caminho de botões não é um diretório.');
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