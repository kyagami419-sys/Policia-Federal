import { SlashCommandBuilder, PermissionFlagsBits, ChannelType } from 'discord.js';
import { getDB } from '../../database.js'; // Ajuste os pontos dependendo de onde o arquivo está localizado
import { atualizarHierarquia } from '../../services/hierarchy.js';

const db = await getDB();

export default {
    data: new SlashCommandBuilder()
        .setName('hierarquia')
        .setDescription('Gerencia as divisões e cargos da Hierarquia.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        
        .addSubcommand(sub => sub
            .setName('setup')
            .setDescription('Define o canal onde a hierarquia será postada.')
            .addChannelOption(opt => opt.setName('canal').setDescription('Canal de texto').addChannelTypes(ChannelType.GuildText).setRequired(true)))
            
        .addSubcommand(sub => sub
            .setName('divisao_criar')
            .setDescription('Cria uma nova divisão (ex: BOPE, ROCAM).')
            .addStringOption(opt => opt.setName('nome').setDescription('Nome da divisão').setRequired(true))
            .addStringOption(opt => opt.setName('emoji').setDescription('Emoji da divisão').setRequired(true)))

        .addSubcommand(sub => sub
            .setName('divisao_remover')
            .setDescription('Remove uma divisão inteira.')
            .addStringOption(opt => opt.setName('nome').setDescription('Nome exato da divisão').setRequired(true)))

        .addSubcommand(sub => sub
            .setName('cargo_add')
            .setDescription('Adiciona um cargo a uma divisão.')
            .addStringOption(opt => opt.setName('divisao').setDescription('Nome exato da divisão').setRequired(true))
            .addRoleOption(opt => opt.setName('cargo').setDescription('O cargo do Discord').setRequired(true)))

        .addSubcommand(sub => sub
            .setName('cargo_remover')
            .setDescription('Remove um cargo de uma divisão.')
            .addRoleOption(opt => opt.setName('cargo').setDescription('O cargo do Discord a remover').setRequired(true))),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        const subCmd = interaction.options.getSubcommand();

       if (subCmd === 'setup') {
            const canal = interaction.options.getChannel('canal');
            const db = await getDB();

            await db.run(`
                INSERT INTO Config (guildId, hierarchyChannel) 
                VALUES (?, ?)
                ON CONFLICT(guildId) DO UPDATE SET hierarchyChannel = excluded.hierarchyChannel
            `, [interaction.guildId, canal.id]);

            await interaction.editReply(`✅ Canal de hierarquia configurado para ${canal}.`);
            await atualizarHierarquia(interaction.client, interaction.guildId);
        }

        else if (subCmd === 'divisao_criar') {
            const nome = interaction.options.getString('nome');
            const emoji = interaction.options.getString('emoji');

            const db = await getDB();
            const existe = await db.get('SELECT * FROM Division WHERE guildId = ? AND name = ?', [interaction.guildId, nome]);
            if (existe) return interaction.editReply('❌ Essa divisão já existe.');

            await db.run('INSERT INTO Division (guildId, name, emoji) VALUES (?, ?, ?)', [interaction.guildId, nome, emoji]);
            await interaction.editReply(`✅ Divisão \`${nome}\` criada com o emoji ${emoji}.`);
        }

        else if (subCmd === 'divisao_remover') {
            const nome = interaction.options.getString('nome');
            const db = await getDB();
            const existe = await db.get('SELECT * FROM Division WHERE guildId = ? AND name = ?', [interaction.guildId, nome]);
            if (!existe) return interaction.editReply('❌ Divisão não encontrada.');

            await db.run('DELETE FROM Division WHERE id = ?', [existe.id]);
            await interaction.editReply(`✅ Divisão \`${nome}\` removida do sistema.`);
            await atualizarHierarquia(interaction.client, interaction.guildId);
        }

        else if (subCmd === 'cargo_add') {
            const nomeDiv = interaction.options.getString('divisao');
            const cargo = interaction.options.getRole('cargo');
            const db = await getDB();

            const div = await db.get('SELECT * FROM Division WHERE guildId = ? AND name = ?', [interaction.guildId, nomeDiv]);
            if (!div) return interaction.editReply('❌ Divisão não encontrada. Use o nome exato.');

            const jaTem = await db.get('SELECT * FROM DivisionRole WHERE divisionId = ? AND roleId = ?', [div.id, cargo.id]);
            if (jaTem) return interaction.editReply('❌ Esse cargo já está nessa divisão.');

            await db.run('INSERT INTO DivisionRole (divisionId, roleId) VALUES (?, ?)', [div.id, cargo.id]);
            await interaction.editReply(`✅ Cargo ${cargo.name} adicionado à divisão \`${nomeDiv}\`.`);
            await atualizarHierarquia(interaction.client, interaction.guildId);
        }

        else if (subCmd === 'cargo_remover') {
            const cargo = interaction.options.getRole('cargo');
            const db = await getDB();
            const relation = await db.get('SELECT * FROM DivisionRole WHERE roleId = ? AND divisionId IN (SELECT id FROM Division WHERE guildId = ?)', [cargo.id, interaction.guildId]);
            if (!relation) return interaction.editReply('❌ Esse cargo não pertence a nenhuma divisão.');

            await db.run('DELETE FROM DivisionRole WHERE id = ?', [relation.id]);
            await interaction.editReply(`✅ Cargo ${cargo.name} removido da hierarquia.`);
            await atualizarHierarquia(interaction.client, interaction.guildId);
        }
    }
};