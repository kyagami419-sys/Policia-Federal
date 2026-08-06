import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('painel_recrutamento')
        .setDescription('Painel de setagem para novos policiais')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('🚓 Recrutamento - Polícia')
            // SEM PONTO E VÍRGULA AQUI NO FINAL 👇
            .setThumbnail(interaction.guild.iconURL({ dynamic: true, size: 1024 }))
            .setDescription(`⚖️ POLÍCIA FEDERAL ACIMA DE TUDO, DEUS ACIMA DE TODOS. 🦅
👑 CADASTRO — POLICIA FEDERAL - BRASIL RP 👑
Seja bem-vindo(a) ao processo de registro da Polícia Federal Brasil RP.

Para integrar oficialmente nossos quadros, clique no botão abaixo e preencha corretamente todas as informações solicitadas.

Você precisará informar:
🪪 Seu QRA
🏷️ Seu ID em Game
📗 O nome do Recrutador responsável
🎖️A patente pretendida: Estagiario ou Agente

Após o envio, sua ficha será analisada pela equipe responsável. Fique atento às suas mensagens diretas para acompanhar o resultado.
POLÍCIA FEDERAL | SISTEMA DE REGISTROS`) 
            .setColor('#18b158');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('btn_iniciar_conscrito') 
                .setLabel('Realizar Cadastro')
                .setEmoji('📋')
                .setStyle(ButtonStyle.Primary)
        );

        await interaction.reply({ embeds: [embed], components: [row] });
    }
};