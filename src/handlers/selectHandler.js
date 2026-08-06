import fs from 'fs';
import path from 'path';

export async function loadSelects(client) {

    const selectsPath = path.join(
        process.cwd(),
        'src',
        'selects'
    );

    const folders = fs.readdirSync(selectsPath);

    for (const folder of folders) {

        const folderPath = path.join(
            selectsPath,
            folder
        );

        const files = fs
            .readdirSync(folderPath)
            .filter(file => file.endsWith('.js'));

        for (const file of files) {

            const filePath = path.join(folderPath, file);

            const select =
                await import(`file://${filePath}`);

            client.selects.set(
                select.default.customId,
                select.default
            );
        }
    }
}