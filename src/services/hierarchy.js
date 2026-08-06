import { getDB } from '../database.js';
import { EmbedBuilder } from 'discord.js';

const db = await getDB();

export async function atualizarHierarquia(client, guildId) {
    try {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) return;

        const db = await getDB();
        const config = await db.get('SELECT * FROM Config WHERE guildId = ?', [guildId]);

        if (!config || !config.hierarchyChannel) return;

        const channel = guild.channels.cache.get(config.hierarchyChannel);
        if (!channel) return;

        // 1. Força o bot a buscar todos os membros para a contagem não ficar errada
        await guild.members.fetch();

        // 2. Apaga as mensagens antigas enviadas pelo bot no canal (Limita a 100)
        const messages = await channel.messages.fetch({ limit: 100 });
        const botMessages = messages.filter(m => m.author.id === client.user.id);
        for (const [id, msg] of botMessages) {
            await msg.delete().catch(() => { });
        }

        // 1. Busca todas as divisões da guilda
        const divisoes = await db.all('SELECT * FROM Division WHERE guildId = ?', [guildId]);

        // 2. Para cada divisão, busca os cargos associados (equivalente ao include)
        for (const div of divisoes) {
            div.roles = await db.all('SELECT * FROM DivisionRole WHERE divisionId = ?', [div.id]);
        }

        if (divisoes.length === 0) return;

        // 4. Ordena as Divisões baseado no cargo mais alto dentro delas
        const divisoesOrdenadas = [];
        for (const div of divisoes) {
            let maxPosition = 0;
            const validRoles = [];

            for (const dr of div.roles) {
                const role = guild.roles.cache.get(dr.roleId);
                if (role) {
                    validRoles.push(role);
                    if (role.position > maxPosition) maxPosition = role.position;
                }
            }
            divisoesOrdenadas.push({ ...div, validRoles, maxPosition });
        }

        // Ordem decrescente (Maior cargo para o menor)
        divisoesOrdenadas.sort((a, b) => b.maxPosition - a.maxPosition);

        // 5. Envia as mensagens no chat
        for (const div of divisoesOrdenadas) {
            if (div.validRoles.length === 0) continue;

            // Envia o título da Divisão
            await channel.send(`## ${div.emoji} ${div.name}`);

            // Ordena os cargos dentro da divisão
            div.validRoles.sort((a, b) => b.position - a.position);

            for (const role of div.validRoles) {
                // Pega todos os membros que possuem este cargo
                const membrosRole = role.members.map(m => m);

                // Se o cargo estiver vazio (ninguém tem ele), ignora e não envia
                if (membrosRole.length === 0) continue;

                const descricao = membrosRole.map(m => `• <@${m.user.id}>`).join('\n');

                const embed = new EmbedBuilder()
                    .setTitle(`${role.name} [${membrosRole.length}]`)
                    .setDescription(descricao)
                    .setColor(role.hexColor !== '#000000' ? role.hexColor : '#2b2d31')
                    .setFooter({ text: 'Atualizado automaticamente' });

                if (guild.iconURL()) embed.setThumbnail(guild.iconURL({ dynamic: true }));

                await channel.send({ embeds: [embed] });
            }
        }
    } catch (error) {
        console.error('❌ Erro ao atualizar hierarquia:', error);
    }
}

// O LOOP de 1 hora
export function iniciarLoopHierarquia(client) {
    console.log('🏛️ [Sistema] Auto-updater de hierarquia ativado.');

    // Roda a cada 1 hora (3600000 milissegundos)
    setInterval(async () => {
        // Busca os servidores que possuem hierarquia configurada e atualiza
        const db = await getDB();
        // db.all busca uma array com todos os resultados que batem com a pesquisa
        const configs = await db.all('SELECT * FROM Config WHERE hierarchyChannel IS NOT NULL');

        for (const conf of configs) {
            await atualizarHierarquia(client, conf.guildId);
        }
    }, 3600000);
}