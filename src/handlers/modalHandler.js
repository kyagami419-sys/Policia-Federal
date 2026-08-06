import fs from 'fs';
import path from 'path';

export async function loadModals(client) {

    const modalsPath = path.join(
        process.cwd(),
        'src',
        'modals'
    );

    const folders = fs.readdirSync(modalsPath);

    for (const folder of folders) {

        const folderPath = path.join(
            modalsPath,
            folder
        );

        const files = fs
            .readdirSync(folderPath)
            .filter(file => file.endsWith('.js'));

        for (const file of files) {

            const filePath = path.join(folderPath, file);

            const modal =
                await import(`file://${filePath}`);

            client.modals.set(
                modal.default.customId,
                modal.default
            );
        }
    }
} 