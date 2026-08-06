import fs from 'fs';
import path from 'path';

export async function loadButtons(client) {

    const buttonsPath = path.join(
        process.cwd(),
        'src',
        'components',
        'buttons'
    );

    const folders = fs.readdirSync(buttonsPath);

    for (const folder of folders) {

        const folderPath = path.join(
            buttonsPath,
            folder
        );

        const files = fs
            .readdirSync(folderPath)
            .filter(file => file.endsWith('.js'));

        for (const file of files) {

            const filePath = path.join(folderPath, file);

            const button =
                await import(`file://${filePath}`);

            client.buttons.set(
                button.default.customId,
                button.default
            );
        }
    }
}