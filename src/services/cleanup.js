import { getDB } from '../database.js';
import { EmbedBuilder } from 'discord.js';

const db = await getDB();

// 👇 RETIREI O ", prisma" DESTA LINHA 👇
export function iniciarLimpezaAutomatica(client) {
    console.log('🧹 [Sistema] Limpeza automática de advertências ativada.');

    const limparFichas = async () => {
        try {
            console.log('🔎 [Debug] Iniciando busca no banco por fichas expiradas...');

            // 1. Busca todas as advertências ativas que já passaram da data de expiração
           const db = await getDB();
            const expiradas = await db.all(
                'SELECT * FROM Advertencia WHERE active = 1 AND expiresAt <= ?', 
                [new Date().toISOString()]
            );

            console.log(`🔎 [Debug] Total de fichas expiradas encontradas: ${expiradas.length}`);

            if (expiradas.length === 0) {
                console.log('🔎 [Debug] Nada para limpar no momento. Encerrando processo.');
                return; // Se não tiver nada para limpar, encerra
            }

            // 2. Desativa as advertências no banco de dados
            await prisma.advertencia.updateMany({
                where: { id: { in: expiradas.map(a => a.id) } },
                data: { active: false }
            });
            console.log('🔎 [Debug] Fichas atualizadas para active: false no banco.');

            // Agrupa por servidor
            const servidoresInvolvidos = [...new Set(expiradas.map(a => a.guildId))];

            for (const guildId of servidoresInvolvidos) {
                const guildExpiradas = expiradas.filter(a => a.guildId === guildId);
                const db = await getDB();
                const config = await db.get('SELECT * FROM Config WHERE guildId = ?', [guildId]);
                console.log(`🔎 [Debug] Procurando config do servidor. Achou? ${!!config}`);
                console.log(`🔎 [Debug] ID do Canal de Expiradas no banco: ${config?.expLogsChannel || 'NENHUM'}`);

                const guild = client.guilds.cache.get(guildId);
                if (!guild) continue;

                let relatorio = '';

                // 3. Processa cada punição
                for (const adv of guildExpiradas) {
                    relatorio += `• <@${adv.userId}> - \`${adv.type.toUpperCase()}\`\n`;

                    if (config) {
                        let roleToRemove = null;
                        const tipoLower = adv.type.toLowerCase();

                        if (tipoLower.includes('verbal')) roleToRemove = config.advVerbalRole;
                        else if (tipoLower.includes('n1')) roleToRemove = config.adv1Role;
                        else if (tipoLower.includes('n2') || tipoLower.includes('n3')) roleToRemove = config.adv2Role;

                        if (roleToRemove) {
                            try {
                                const member = await guild.members.fetch(adv.userId);
                                if (member) await member.roles.remove(roleToRemove);
                            } catch (err) { }
                        }
                    }
                }

                // 4. Envia a log da faxina
                if (config && config.expLogsChannel) {
                    const logChannel = guild.channels.cache.get(config.expLogsChannel);
                    console.log(`🔎 [Debug] O bot encontrou o canal no Discord? ${!!logChannel}`);

                    if (logChannel) {
                        const logEmbed = new EmbedBuilder()
                            .setTitle('🧹 LIMPEZA DE FICHAS CONCLUÍDA')
                            .setColor('Blue')
                            .setDescription(`As seguintes advertências atingiram o prazo prescricional e os **cargos foram removidos**:\n\n${relatorio}`)
                            .setFooter({ text: 'Corregedoria' })
                            .setTimestamp();

                        await logChannel.send({ embeds: [logEmbed] });
                        console.log('✅ [Debug] Embed ENVIADA COM SUCESSO para o canal!');
                    } else {
                        console.log('❌ [ERRO] O canal está no banco, mas o bot não encontrou no Discord! (ID errado ou sem permissão para ver o canal)');
                    }
                } else {
                    console.log('❌ [ERRO] Não enviou a Embed porque não há expLogsChannel configurado no banco de dados!');
                }
            }
            console.log(`✅ [Corregedoria] Limpeza finalizada.`);

        } catch (error) {
            console.error('❌ [ERRO] Falha ao rodar a limpeza:', error);
        }
    };

    // Roda instantaneamente ao ligar
    limparFichas();
    // Roda a cada 12 horas
    setInterval(limparFichas, 1000 * 60 * 60 * 12);
}