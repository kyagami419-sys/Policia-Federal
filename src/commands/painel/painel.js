import {
    SlashCommandBuilder,
    MessageFlags,

    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SectionBuilder,

    ButtonBuilder,
    ButtonStyle
} from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('painel')
        .setDescription('Abrir painel policial'),

    async execute(interaction) {

        const advertenciasBtn = new ButtonBuilder()
            .setCustomId('painel_advertencias')
            .setLabel('Advertências')
            .setEmoji('⚠️')
            .setStyle(ButtonStyle.Danger);

        const promocoesBtn = new ButtonBuilder()
            .setCustomId('painel_promocao')
            .setLabel('Promoções')
            .setEmoji('📈')
            .setStyle(ButtonStyle.Success);

        const hierarquiaBtn = new ButtonBuilder()
            .setCustomId('painel_hierarquia')
            .setLabel('Hierarquia')
            .setEmoji('🏛️')
            .setStyle(ButtonStyle.Primary);

        const fichasBtn = new ButtonBuilder()
            .setCustomId('painel_fichas')
            .setLabel('Fichas')
            .setEmoji('📁')
            .setStyle(ButtonStyle.Secondary);

        const configuracoesBtn = new ButtonBuilder()
            .setCustomId('painel_configuracoes')
            .setLabel('Configurações')
            .setEmoji('⚙️')
            .setStyle(ButtonStyle.Secondary);

        const container = new ContainerBuilder()

            .addTextDisplayComponents(

                new TextDisplayBuilder()
                    .setContent(
                        `# 👮 Sistema Policial

### Central de Gestão da Corporação

Gerencie toda a estrutura policial através dos módulos abaixo.`
                    )
            )

            .addSeparatorComponents(
                new SeparatorBuilder()
            )

            .addSectionComponents(

                new SectionBuilder()
                    .addTextDisplayComponents(

                        new TextDisplayBuilder()
                            .setContent(
                                `⚠️ **Gestão Disciplinar**
Aplicação e controle de advertências`
                            )
                    )
                    .setButtonAccessory(
                        advertenciasBtn
                    )
            )

            .addSectionComponents(

                new SectionBuilder()
                    .addTextDisplayComponents(

                        new TextDisplayBuilder()
                            .setContent(
                                `📈 **Promoções**
Promoções, rebaixamentos e transferências`
                            )
                    )
                    .setButtonAccessory(
                        promocoesBtn
                    )
            )

            .addSectionComponents(

                new SectionBuilder()
                    .addTextDisplayComponents(

                        new TextDisplayBuilder()
                            .setContent(
                                `🏛️ **Hierarquia**
Gerenciamento de divisões e cargos`
                            )
                    )
                    .setButtonAccessory(
                        hierarquiaBtn
                    )
            )

            .addSectionComponents(

                new SectionBuilder()
                    .addTextDisplayComponents(

                        new TextDisplayBuilder()
                            .setContent(
                                `📁 **Fichas Policiais**
Consulta e histórico completo`
                            )
                    )
                    .setButtonAccessory(
                        fichasBtn
                    )
            )

            .addSectionComponents(

                new SectionBuilder()
                    .addTextDisplayComponents(

                        new TextDisplayBuilder()
                            .setContent(
                                `⚙️ **Configurações**
Canais, cargos e sistema`
                            )
                    )
                    .setButtonAccessory(
                        configuracoesBtn
                    )
            );

        await interaction.reply({
            components: [container],
            flags: MessageFlags.IsComponentsV2
        });
    }
};