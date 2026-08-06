import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('convocar')
        .setDescription('Abre um painel de convocação para uma ação tática')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addStringOption(option => option.setName('local').setDescription('Onde será a ação?').setRequired(true))
        .addStringOption(option => option.setName('faccao').setDescription('Contra quem?').setRequired(true))
        .addIntegerOption(option => option.setName('vagas').setDescription('Quantos policiais podem ir?').setRequired(true).setMinValue(1).setMaxValue(30))
        // 👇 AQUI ESTÁ A NOVA OPÇÃO DE VALOR 👇
        .addStringOption(option => option.setName('valor').setDescription('Qual o repasse em caso de vitória? (Ex: R$ 50.000)').setRequired(true)),

    async execute(interaction) {
        const local = interaction.options.getString('local');
        const faccao = interaction.options.getString('faccao');
        const vagas = interaction.options.getInteger('vagas');
        const valor = interaction.options.getString('valor'); // Pegando o valor

        const embed = new EmbedBuilder()
            .setTitle('🚨 CONVOCAÇÃO PARA AÇÃO TÁTICA')
            .setDescription('Atenção, oficiais! Precisamos de contingente para uma operação. Confirme sua presença clicando no botão abaixo.')
            .setColor('DarkRed')
            .addFields(
                { name: '📍 Local', value: `\`${local}\``, inline: true },
                { name: '🏴 Força Opositora', value: `\`${faccao}\``, inline: true },
                { name: '👥 Vagas', value: `\`${vagas}\``, inline: true },
                { name: '💰 Repasse', value: `\`${valor}\``, inline: true }, // Guardamos o valor aqui!
                { name: `👮 Participantes [0/${vagas}]`, value: 'Nenhum oficial na lista ainda.', inline: false }
            )
            .setFooter({ text: 'Comando da Polícia Federal' })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`acao_entrar_${vagas}`).setLabel('Participar').setEmoji('🔫').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('acao_sair').setLabel('Sair').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('acao_vitoria').setLabel('Vitória').setEmoji('🏆').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('acao_derrota').setLabel('Derrota').setEmoji('💀').setStyle(ButtonStyle.Danger)
        );

        await interaction.reply({ embeds: [embed], components: [row] });
    }
};