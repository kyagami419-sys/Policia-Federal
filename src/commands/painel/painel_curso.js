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
        .setName('painel_curso')
        .setDescription('Abrir painel de Curso'),

    async execute(interaction) {

        const cursoBtn = new ButtonBuilder()
            .setCustomId('painel_curso')
            .setLabel('Criar Curso')
            .setEmoji('⚙️')
            .setStyle(ButtonStyle.Secondary);

        const container = new ContainerBuilder()

            .addTextDisplayComponents(

                new TextDisplayBuilder()
                    .setContent(
                        `# 👮 Sistema Policial

### Central de Gestão da Corporação

Gerencie os Cursos através dos módulos abaixo.`
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
                                `⚙️ **Criar Curso**
Aperte no botão ao lado e crie anuncios para cursos`
                            )
                    )
                    .setButtonAccessory(
                        cursoBtn
                    )
            );

        await interaction.reply({
            components: [container],
            flags: MessageFlags.IsComponentsV2
        });
    }
};