import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

export async function loadEvents(client) {
    const eventsPath = path.join(process.cwd(), 'src', 'events');
    
    // Verifica se a pasta existe
    if (!fs.existsSync(eventsPath)) return;

    const files = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

    for (const file of files) {
        const filePath = path.join(eventsPath, file);
        
        // Converte o caminho do Windows para formato URL
        const fileUrl = pathToFileURL(filePath).href;

        try {
            const eventModule = await import(fileUrl);
            const event = eventModule.default;

            // Trava de segurança: verifica se a estrutura do evento está correta
            if (!event || !event.name) {
                console.log(`⚠️ [AVISO] O evento '${file}' foi ignorado pois não possui a estrutura correta ('export default' e 'name').`);
                continue;
            }

            // Registra o evento no client do Discord
            if (event.once) {
                client.once(event.name, (...args) => event.execute(...args, client));
            } else {
                client.on(event.name, (...args) => event.execute(...args, client));
            }
        } catch (error) {
            console.error(`❌ [ERRO] Falha ao carregar o evento no arquivo ${file}:`, error);
        }
    }
}