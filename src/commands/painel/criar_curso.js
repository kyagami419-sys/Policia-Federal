import { SlashCommandBuilder, ActionRowBuilder, RoleSelectMenuBuilder, ChannelType, MessageFlags } from 'discord.js';
import { getDB } from '../../database.js';

export default {
    data: new SlashCommandBuilder()
        .setName('criar_curso')
        .setDescription('Inicia a criação de um anúncio de curso com múltiplos cargos')
        .addStringOption(option => 
            option.setName('nome')
                .setDescription('Nome do Curso (Ex: Formação Tática)')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('horario')
                .setDescription('Horário ou Data (Ex: Hoje às 20:00)')
                .setRequired(true))
        .addChannelOption(option => 
            option.setName('canal_voz')
                .setDescription('Canal de voz onde o curso será ministrado')
                .addChannelTypes(ChannelType.GuildVoice)
                .setRequired(true)),

    async execute(interaction) {
        if (!interaction.member.permissions.has('ManageRoles')) {
            return interaction.reply({ content: '❌ Você não tem permissão para criar cursos.', flags: MessageFlags.Ephemeral });
        }

        const nome = interaction.options.getString('nome');
        const horario = interaction.options.getString('horario');
        const canalVoz = interaction.options.getChannel('canal_voz');

        const db = await getDB();
        await db.exec(`
                CREATE TABLE IF NOT EXISTS CourseSetup (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    guildId TEXT,
                    name TEXT,
                    horario TEXT,
                    voiceChannelId TEXT,
                    messageId TEXT
                );
                CREATE TABLE IF NOT EXISTS CourseSetupRole (
                    setupId INTEGER,
                    roleId TEXT
                );
            `);

        const result = await db.run(
            'INSERT INTO CourseSetup (guildId, name, horario, voiceChannelId) VALUES (?, ?, ?, ?)',
            [interaction.guildId, nome, horario, canalVoz.id]
        );
        const setupId = result.lastID;

        const roleMenu = new RoleSelectMenuBuilder()
            .setCustomId(`setup_curso_roles_${setupId}`)
            .setPlaceholder('Selecione um ou mais cargos/patentes')
            .setMinValues(1)
            .setMaxValues(10);

        await interaction.reply({
            content: `📚 **Criando Curso: ${nome}**\n🔊 **Canal de Voz:** ${canalVoz}\nSelecione abaixo **os cargos** que serão entregues aos aprovados:`,
            components: [new ActionRowBuilder().addComponents(roleMenu)],
            flags: MessageFlags.Ephemeral
        });
    }
};