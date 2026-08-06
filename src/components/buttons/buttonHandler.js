import fs from 'node:fs';
import path from 'node:path';

export async function loadButtons(client) {
    const buttonsDir = path.join(process.cwd(), 'src', 'components', 'buttons');

    // Se a pasta não existir, apenas encerra a função sem dar erro
    if (!fs.existsSync(buttonsDir)) {
        console.log('⚠️ [AVISO] A pasta de botões não existe. Ignorando carregamento de botões.');
        return;
    }

    const buttonFiles = fs.readdirSync(buttonsDir).filter(file => file.endsWith('.js'));
    
    for (const file of buttonFiles) {
        const filePath = path.join(buttonsDir, file);
        const button = await import(`file://${filePath}`);
        if (button.default && button.default.data) {
            client.buttons.set(button.default.data.name, button.default);
        }
    }
}