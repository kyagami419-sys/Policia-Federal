export default {

    customId: 'painel_advertencias',

    async execute(interaction) {

        await interaction.reply({

            content:
                '⚠️ Painel de Advertências em desenvolvimento.',

            ephemeral: true
        });
    }
};