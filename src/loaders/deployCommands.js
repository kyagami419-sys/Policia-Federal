import { REST, Routes } from 'discord.js';
import 'dotenv/config'; // Importante: Carrega as variáveis do .env

export async function deployCommands(commands) {
    // Pega o Token e o Client ID (suporta TOKEN ou DISCORD_TOKEN)
    const token = process.env.TOKEN || process.env.DISCORD_TOKEN;
    const clientId = process.env.CLIENT_ID;

    // Trava de segurança para avisar se esquecer algo no .env
    if (!token || !clientId) {
        console.error("❌ [ERRO CRÍTICO] O TOKEN ou CLIENT_ID não foram encontrados no arquivo .env!");
        return;
    }

    const rest = new REST({ version: '10' }).setToken(token);

    try {
        console.log(`⏳ Iniciando o registro de ${commands.length} slash commands na API do Discord...`);

        // Envia os comandos globalmente para o Discord
        await rest.put(
            Routes.applicationCommands(clientId),
            { body: commands }
        );

        console.log('✅ Slash commands registrados com sucesso!');
    } catch (error) {
        console.error('❌ [ERRO] Falha ao registrar os comandos:', error);
    }
}