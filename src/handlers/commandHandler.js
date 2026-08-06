import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url'; // Importante para o Windows

export async function loadCommands(client) {
    const commands = [];
    const commandsPath = path.join(process.cwd(), 'src', 'commands');

    // Verifica se a pasta existe para não quebrar
    if (!fs.existsSync(commandsPath)) return commands;

    const folders = fs.readdirSync(commandsPath);

    for (const folder of folders) {
        const folderPath = path.join(commandsPath, folder);

        // Garante que está lendo apenas pastas (ignora arquivos soltos)
        if (!fs.statSync(folderPath).isDirectory()) continue;

        const files = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));

        for (const file of files) {
            const filePath = path.join(folderPath, file);
            
            // Converte o caminho do Windows para o formato de URL de arquivo exigido pelo ES Modules
            const fileUrl = pathToFileURL(filePath).href;

            try {
                const command = await import(fileUrl);

                // Trava de segurança: verifica se a estrutura está correta
                if (!command.default || !command.default.data) {
                    console.log(`⚠️ [AVISO] O arquivo '${file}' foi ignorado pois não possui a estrutura correta ('export default' e 'data').`);
                    continue; 
                }

                client.commands.set(
                    command.default.data.name,
                    command.default
                );

                commands.push(
                    command.default.data.toJSON()
                );
            } catch (error) {
                console.error(`❌ [ERRO] Falha ao carregar o comando no arquivo ${file}:`, error);
            }
        }
    }

    return commands;
}