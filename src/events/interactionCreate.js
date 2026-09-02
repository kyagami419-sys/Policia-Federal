import {
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    ChannelSelectMenuBuilder,
    RoleSelectMenuBuilder,
    StringSelectMenuBuilder,
    ChannelType
} from 'discord.js';
import { getDB } from '../database.js';

export default {
    name: 'interactionCreate',
    async execute(interaction, client) {

        // ==========================================
        // 0. EXECUTAR SLASH COMMANDS
        // ==========================================
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;
            try {
                await command.execute(interaction);
            } catch (error) {
                console.error(`❌ Erro no comando:`, error);
                const replyMethod = interaction.replied || interaction.deferred ? 'followUp' : 'reply';
                await interaction[replyMethod]({ content: 'Erro ao executar comando.', flags: MessageFlags.Ephemeral });
            }
        }

        // ==========================================
        // 1. MENU BIFURCAÇÃO (CANAIS OU CARGOS)
        // ==========================================
        else if (interaction.isButton() && interaction.customId === 'painel_configuracoes') {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_config_canais').setLabel('Configurar Canais').setStyle(ButtonStyle.Primary).setEmoji('📂'),
                new ButtonBuilder().setCustomId('btn_config_cargos').setLabel('Configurar Cargos').setStyle(ButtonStyle.Secondary).setEmoji('🏷️')
            );

            try {
                await interaction.reply({
                    content: '⚙️ **Configurações da Corregedoria**\nO que você deseja configurar agora?',
                    components: [row],
                    flags: MessageFlags.Ephemeral
                });
            } catch (e) { /* Ignora duplo clique */ }
        }

        // ==========================================
        // SISTEMA DE AÇÕES (ENTRAR, SAIR, VITÓRIA, DERROTA)
        // ==========================================
        else if (interaction.isButton() && interaction.customId?.startsWith('acao_')) {

            const db = await getDB();
            const config = await db.get('SELECT * FROM Config WHERE guildId = ?', [interaction.guildId]);

            if (interaction.customId.startsWith('acao_entrar_') || interaction.customId === 'acao_sair') {

                if (config?.cargoPolicial && !interaction.member.roles.cache.has(config.cargoPolicial)) {
                    return await interaction.reply({ content: `❌ Você precisa do cargo <@&${config.cargoPolicial}> para participar de ações!`, ephemeral: true });
                }

                const message = interaction.message;
                const embedOriginal = message.embeds[0];
                const campoParticipantes = embedOriginal.fields.find(f => f.name.startsWith('👮 Participantes'));
                let lista = campoParticipantes.value === 'Nenhum oficial na lista ainda.' ? [] : campoParticipantes.value.split('\n');

                if (interaction.customId.startsWith('acao_entrar_')) {
                    const limiteVagas = parseInt(interaction.customId.split('_')[2]);

                    if (lista.includes(`<@${interaction.user.id}>`)) return await interaction.reply({ content: '❌ Você já está inscrito!', ephemeral: true });
                    if (lista.length >= limiteVagas) return await interaction.reply({ content: '⚠️ Ação lotada!', ephemeral: true });

                    lista.push(`<@${interaction.user.id}>`);
                    const novaEmbed = EmbedBuilder.from(embedOriginal);
                    const indexCampo = novaEmbed.data.fields.findIndex(f => f.name.startsWith('👮 Participantes'));

                    novaEmbed.data.fields[indexCampo] = { name: `👮 Participantes [${lista.length}/${limiteVagas}]`, value: lista.join('\n'), inline: false };
                    await message.edit({ embeds: [novaEmbed] });
                    return await interaction.reply({ content: '✅ Você entrou na convocação!', ephemeral: true });
                }

                if (interaction.customId === 'acao_sair') {
                    if (!lista.includes(`<@${interaction.user.id}>`)) return await interaction.reply({ content: '❌ Você não está inscrito.', ephemeral: true });

                    lista = lista.filter(user => user !== `<@${interaction.user.id}>`);
                    const limiteVagas = embedOriginal.fields.find(f => f.name.includes('Vagas')).value.replace(/`/g, '');
                    const novaEmbed = EmbedBuilder.from(embedOriginal);
                    const indexCampo = novaEmbed.data.fields.findIndex(f => f.name.startsWith('👮 Participantes'));

                    novaEmbed.data.fields[indexCampo] = { name: `👮 Participantes [${lista.length}/${limiteVagas}]`, value: lista.length > 0 ? lista.join('\n') : 'Nenhum oficial na lista ainda.', inline: false };
                    await message.edit({ embeds: [novaEmbed] });
                    return await interaction.reply({ content: '🚪 Você saiu da convocação.', ephemeral: true });
                }
            }

            if (interaction.customId === 'acao_vitoria' || interaction.customId === 'acao_derrota') {
                if (config?.cargoComando) {
                    if (!interaction.member.roles.cache.has(config.cargoComando)) {
                        return await interaction.reply({ content: `❌ Apenas oficiais do Comando (<@&${config.cargoComando}>) podem finalizar a ação!`, ephemeral: true });
                    }
                } else if (!interaction.member.permissions.has('ManageMessages')) {
                    return await interaction.reply({ content: '❌ Apenas administradores podem finalizar a ação!', ephemeral: true });
                }

                const isVitoria = interaction.customId === 'acao_vitoria';
                const message = interaction.message;
                const embedOriginal = message.embeds[0];
                const campoParticipantes = embedOriginal.fields.find(f => f.name.startsWith('👮 Participantes'));
                let lista = campoParticipantes.value === 'Nenhum oficial na lista ainda.' ? [] : campoParticipantes.value.split('\n');

                if (lista.length === 0) return await interaction.reply({ content: '❌ A ação foi cancelada. Não havia nenhum oficial.', ephemeral: true });

                const novaEmbed = EmbedBuilder.from(embedOriginal)
                    .setTitle(`🚨 AÇÃO FINALIZADA - ${isVitoria ? 'VITÓRIA 🏆' : 'DERROTA 💀'}`)
                    .setColor(isVitoria ? 'Green' : 'Red');

                await message.edit({ embeds: [novaEmbed], components: [] });

                if (!isVitoria) return await interaction.reply({ content: '💀 Ação finalizada com **Derrota**. Nenhum repasse será gerado.', ephemeral: true });

                const campoValor = embedOriginal.fields.find(f => f.name.includes('💰 Repasse'));
                const valorSugerido = campoValor ? campoValor.value.replace(/`/g, '') : 'Valor não definido';

                const embedPagamento = new EmbedBuilder()
                    .setTitle('💰 RELATÓRIO DE PAGAMENTO - AÇÃO TÁTICA')
                    .setColor('Gold')
                    .setDescription(`A operação foi encerrada pelo(a) <@${interaction.user.id}> com **VITÓRIA**! 🏆\n\n**Oficiais para receber repasse (${valorSugerido}):**\n\n${lista.join('\n')}`)
                    .setFooter({ text: 'Polícia Federal - Departamento Financeiro' })
                    .setTimestamp();

                if (config && config.acoesLogsChannel) {
                    const logChannel = interaction.guild.channels.cache.get(config.acoesLogsChannel);
                    if (logChannel) {
                        await logChannel.send({ embeds: [embedPagamento] });
                        return await interaction.reply({ content: `✅ Ação finalizada com **Vitória**! O log foi enviado em <#${config.acoesLogsChannel}>.`, ephemeral: true });
                    }
                }

                return await interaction.reply({ content: `✅ Ação finalizada com **Vitória**! \n⚠️ **Aviso:** Canal de logs não configurado.`, ephemeral: true });
            }
        }

        // ==========================================
        // 1.1 GERAR MENUS DE CANAIS
        // ==========================================
        // ==========================================
        // 1.1 GERAR MENUS DE CANAIS
        // ==========================================
        else if (interaction.isButton() && interaction.customId === 'btn_config_canais') {
            const advMenu = new ChannelSelectMenuBuilder().setCustomId('cfg_chan_adv').setPlaceholder('Canal: Logs de Advertências').setChannelTypes(ChannelType.GuildText);
            const promoMenu = new ChannelSelectMenuBuilder().setCustomId('cfg_chan_promo').setPlaceholder('Canal: Logs de Promoções').setChannelTypes(ChannelType.GuildText);
            const exoMenu = new ChannelSelectMenuBuilder().setCustomId('cfg_chan_exo').setPlaceholder('Canal: Logs de Exoneração').setChannelTypes(ChannelType.GuildText);
            const approvalMenu = new ChannelSelectMenuBuilder().setCustomId('cfg_chan_approval').setPlaceholder('Canal: Aprovação de Setagens').addChannelTypes(ChannelType.GuildText);
            const expMenu = new ChannelSelectMenuBuilder().setCustomId('cfg_chan_exp').setPlaceholder('Canal: Logs de ADVs Expiradas').setChannelTypes(ChannelType.GuildText);
            
            const acaoLog = new ChannelSelectMenuBuilder().setCustomId('cfg_chan_acao').setPlaceholder('Canal: Logs de ações pagas').setChannelTypes(ChannelType.GuildText);
            const cursoMenu = new ChannelSelectMenuBuilder().setCustomId('cfg_chan_curso').setPlaceholder('Canal: Logs / Anúncios de Cursos').setChannelTypes(ChannelType.GuildText);

            await interaction.update({
                content: '📂 **Configuração de Canais (Parte 1)**\nSelecione os canais abaixo:',
                components: [
                    new ActionRowBuilder().addComponents(advMenu),
                    new ActionRowBuilder().addComponents(promoMenu),
                    new ActionRowBuilder().addComponents(exoMenu),
                    new ActionRowBuilder().addComponents(expMenu),
                    new ActionRowBuilder().addComponents(approvalMenu)
                ]
            });

            await interaction.followUp({
                content: '📂 **Configuração de Canais (Parte 2)**',
                components: [
                    new ActionRowBuilder().addComponents(acaoLog),
                    new ActionRowBuilder().addComponents(cursoMenu)
                ],
                ephemeral: true
            });
        }

        // ==========================================
        // HIERARQUIA BOTÕES
        // ==========================================
        else if (interaction.isButton() && interaction.customId === 'painel_hierarquia') {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('hierarquia_atualizar').setLabel('Atualizar').setStyle(ButtonStyle.Success).setEmoji('🔄'),
                new ButtonBuilder().setCustomId('hierarquia_config').setLabel('Configurar Canal').setStyle(ButtonStyle.Secondary).setEmoji('📍'),
                new ButtonBuilder().setCustomId('hierarquia_nova_div').setLabel('Criar Divisão').setStyle(ButtonStyle.Primary).setEmoji('➕')
            );
            await interaction.reply({ content: '🏛️ **Gestão de Hierarquia**', components: [row], flags: MessageFlags.Ephemeral });
        }
        else if (interaction.isButton() && interaction.customId === 'hierarquia_atualizar') {
            await interaction.deferUpdate();
            try {
                const { atualizarHierarquia } = await import('../services/hierarchy.js');
                await atualizarHierarquia(client, interaction.guildId);
            } catch (error) {
                console.error("ERRO AO ATUALIZAR HIERARQUIA:", error);
                await interaction.followUp({ content: '❌ Erro ao atualizar.', flags: 64 });
            }
        }
        else if (interaction.isButton() && interaction.customId === 'hierarquia_config') {
            const canalMenu = new ChannelSelectMenuBuilder().setCustomId('cfg_hierarquia_canal').setPlaceholder('Canal para o quadro').setChannelTypes(ChannelType.GuildText);
            await interaction.reply({ content: '📍 Selecione o canal:', components: [new ActionRowBuilder().addComponents(canalMenu)], flags: MessageFlags.Ephemeral });
        }
        else if (interaction.isButton() && interaction.customId === 'hierarquia_nova_div') {
            const modal = new ModalBuilder().setCustomId('modal_nova_div').setTitle('Nova Divisão');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('div_nome').setLabel('Nome').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('div_emoji').setLabel('Emoji').setStyle(TextInputStyle.Short).setRequired(true))
            );
            await interaction.showModal(modal);
        }
        else if (interaction.isModalSubmit() && interaction.customId === 'modal_nova_div') {
            const nome = interaction.fields.getTextInputValue('div_nome');
            const emoji = interaction.fields.getTextInputValue('div_emoji');
            const db = await getDB();
            const resultado = await db.run('INSERT INTO Division (guildId, name, emoji) VALUES (?, ?, ?)', [interaction.guildId, nome, emoji]);
            const novaDiv = await db.get('SELECT * FROM Division WHERE id = ?', [resultado.lastID]);

            const cargoMenu = new RoleSelectMenuBuilder().setCustomId(`cfg_add_role_div_${novaDiv.id}`).setPlaceholder('Cargos da divisão').setMinValues(1).setMaxValues(10);
            await interaction.reply({ content: `✅ Divisão **${nome}** criada! Selecione os cargos:`, components: [new ActionRowBuilder().addComponents(cargoMenu)], flags: MessageFlags.Ephemeral });
        }

        // ==========================================
        // CONFIGURAÇÃO DE CARGOS BOTÃO
        // ==========================================
        else if (interaction.isButton() && interaction.customId === 'btn_config_cargos') {
            const verbalMenu = new RoleSelectMenuBuilder().setCustomId('cfg_role_verbal').setPlaceholder('ADV Verbal');
            const n1Menu = new RoleSelectMenuBuilder().setCustomId('cfg_role_n1').setPlaceholder('ADV N1');
            const n2Menu = new RoleSelectMenuBuilder().setCustomId('cfg_role_n2').setPlaceholder('ADV N2');
            const recruitRankMenu = new RoleSelectMenuBuilder().setCustomId('cfg_role_recruit_rank').setPlaceholder('Patente Base');
            const recruitOrgMenu = new RoleSelectMenuBuilder().setCustomId('cfg_role_recruit_org').setPlaceholder('Corporação');
            const roleCmdAcao = new RoleSelectMenuBuilder().setCustomId('cfg_role_comando_acao').setPlaceholder('Comando de Ação');
            const roleAcao = new RoleSelectMenuBuilder().setCustomId('cfg_role_acao').setPlaceholder('Policial Ação');
            const roleInstrutor = new RoleSelectMenuBuilder().setCustomId('cfg_role_instrutor').setPlaceholder('Instrutor de Cursos'); // <- Novo menu

            await interaction.update({
                content: '🏷️ **Configuração de Cargos (Parte 1)**',
                components: [
                    new ActionRowBuilder().addComponents(verbalMenu),
                    new ActionRowBuilder().addComponents(n1Menu),
                    new ActionRowBuilder().addComponents(n2Menu),
                    new ActionRowBuilder().addComponents(recruitRankMenu),
                    new ActionRowBuilder().addComponents(recruitOrgMenu)
                ]
            });
            await interaction.followUp({
                content: '🏷️ **Configuração de Cargos (Parte 2)**',
                components: [
                    new ActionRowBuilder().addComponents(roleAcao),
                    new ActionRowBuilder().addComponents(roleCmdAcao),
                    new ActionRowBuilder().addComponents(roleInstrutor) // <- Adicionado na linha
                ],
                ephemeral: true
            });
        }

        // ==========================================
// 1. CLIQUE NO BOTÃO DO CURSO (Abre o Modal)
// ==========================================
else if (interaction.isButton() && interaction.customId === 'painel_curso') {
    if (!interaction.member.permissions.has('ManageRoles')) {
        return await interaction.reply({ content: '❌ Você não tem permissão para criar cursos.', flags: MessageFlags.Ephemeral });
    }

    const modal = new ModalBuilder()
        .setCustomId('modal_criar_curso')
        .setTitle('Criar Novo Curso');

    modal.addComponents(
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('curso_nome')
                .setLabel('Nome do Curso')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Ex: Formação Tática')
                .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('curso_horario')
                .setLabel('Horário')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Ex: 20:00')
                .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('curso_data')
                .setLabel('Data')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Ex: 03/09/2026')
                .setRequired(true)
        )
    );

    await interaction.showModal(modal);
}

// ==========================================
// 2. SUBMISSÃO DO MODAL (Salva e pede Canal de Voz)
// ==========================================
else if (interaction.isModalSubmit() && interaction.customId === 'modal_criar_curso') {
    const nome = interaction.fields.getTextInputValue('curso_nome');
    const horario = interaction.fields.getTextInputValue('curso_horario');
    const data = interaction.fields.getTextInputValue('curso_data'); // <- Captura a data

    const db = await getDB();
    const result = await db.run(
        'INSERT INTO CourseSetup (guildId, name, horario, data) VALUES (?, ?, ?, ?)', // 4 colunas
        [interaction.guildId, nome, horario, data] // 4 valores correspondentes
    );
    const setupId = result.lastID;

    const voiceMenu = new ChannelSelectMenuBuilder()
        .setCustomId(`cfg_curso_voice_${setupId}`)
        .setPlaceholder('Selecione o canal de voz do curso')
        .setChannelTypes(ChannelType.GuildVoice);

    await interaction.reply({
        content: `📚 **Curso: ${nome}** (Data: ${data} às ${horario})\n🔊 Agora selecione abaixo o **Canal de Voz** onde o treinamento será ministrado:`,
        components: [new ActionRowBuilder().addComponents(voiceMenu)],
        flags: MessageFlags.Ephemeral
    });
}

// ==========================================
// 3. SELEÇÃO DO CANAL DE VOZ (Abre Cargos)
// ==========================================
else if (interaction.isAnySelectMenu() && interaction.customId.startsWith('cfg_curso_voice_')) {
    const setupId = interaction.customId.replace('cfg_curso_voice_', '');
    const voiceChannelId = interaction.values[0];

    const db = await getDB();
    await db.run('UPDATE CourseSetup SET voiceChannelId = ? WHERE id = ?', [voiceChannelId, setupId]);

    const roleMenu = new RoleSelectMenuBuilder()
        .setCustomId(`setup_curso_roles_${setupId}`)
        .setPlaceholder('Selecione um ou mais cargos/patentes')
        .setMinValues(1)
        .setMaxValues(10);

    await interaction.update({
        content: '✅ Canal de voz vinculado com sucesso!\n🎖️ Por fim, selecione abaixo **os cargos** que serão entregues aos aprovados:',
        components: [new ActionRowBuilder().addComponents(roleMenu)]
    });
}

        // ==========================================
        // 2. OUVINTE DE SELECT MENUS
        // ==========================================
        else if (interaction.isAnySelectMenu()) {
            try {
                const db = await getDB();

                // 14. CONFIGURAÇÃO DE CURSOS (MÚLTIPLOS CARGOS)
              // 14. CONFIGURAÇÃO DE CURSOS (MÚLTIPLOS CARGOS)
if (interaction.customId.startsWith('setup_curso_roles_')) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const setupId = interaction.customId.replace('setup_curso_roles_', '').trim();
    const roleIds = interaction.values;

    const db = await getDB();

    console.log(`🔎 [Debug Curso] Tentando buscar curso ID: "${setupId}"`);

    const course = await db.get('SELECT * FROM CourseSetup WHERE id = ?', [setupId]);

    if (!course) {
        console.error(`❌ [Erro Curso] Curso ID ${setupId} não existe na tabela CourseSetup.`);
        return interaction.editReply({ 
            content: `❌ **Erro Crítico:** O curso com ID \`${setupId}\` não foi encontrado no banco de dados. Isso ocorre se o bot foi reiniciado após o comando ou se a tabela foi recriada. Crie um novo curso clicando no botão novamente.` 
        });
    }

    for (const roleId of roleIds) {
        await db.run('INSERT INTO CourseSetupRole (setupId, roleId) VALUES (?, ?)', [setupId, roleId]);
    }

    const config = await db.get('SELECT * FROM Config WHERE guildId = ?', [interaction.guildId]);
    
    // Alinhado para buscar a coluna correta 'cursoLogsChannel' que você configurou no painel
    const announcementChannelId = config?.cursoLogsChannel;

    if (!announcementChannelId) {
        return interaction.editReply({ content: '❌ O canal de anúncios/logs de cursos não foi configurado nas configurações de canais.' });
    }

    const canalAnuncio = interaction.guild.channels.cache.get(announcementChannelId);
    if (!canalAnuncio) {
        return interaction.editReply({ content: '❌ O canal de anúncios configurado não foi encontrado no servidor.' });
    }

    const rolesFormatted = roleIds.map(id => `<@&${id}>`).join(', ');

    const embedAnuncio = new EmbedBuilder()
        .setTitle(`📚 CURSO / FORMAÇÃO: ${course.name}`)
        .setColor('#1E90FF')
        .setDescription(`Um novo treinamento foi aberto para a corporação!\n\n🕒 **Horário:** \`${course.horario}\` \`${course.data}\`\n🔊 **Canal de Voz:** <#${course.voiceChannelId}>\n🎖️ **Cargos Concedidos:** ${rolesFormatted}\n👤 **Instrutor Responsável:** <@${interaction.user.id}>`)
        .addFields({ name: '👥 Inscritos [0/20]', value: 'Nenhum aluno inscrito ainda.', inline: false })
        .setFooter({ text: 'Clique no botão abaixo para entrar na lista de inscritos.' })
        .setTimestamp();

    const botoesCurso = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`curso_entrar_${setupId}`).setLabel('Inscrever-se').setStyle(ButtonStyle.Success).setEmoji('✅'),
        new ButtonBuilder().setCustomId(`curso_sair_${setupId}`).setLabel('Sair da Lista').setStyle(ButtonStyle.Danger).setEmoji('🚪'),
        new ButtonBuilder().setCustomId(`curso_aprovar_${setupId}`).setLabel('Aprovar Todos').setStyle(ButtonStyle.Primary).setEmoji('🎖️')
    );

    const mensagemAnuncio = await canalAnuncio.send({ embeds: [embedAnuncio], components: [botoesCurso] });
    
    await db.exec(`ALTER TABLE CourseSetup ADD COLUMN messageId TEXT;`).catch(() => {});
    await db.run('UPDATE CourseSetup SET messageId = ? WHERE id = ?', [mensagemAnuncio.id, setupId]);

    return interaction.editReply({ content: `✅ Anúncio do curso **${course.name}** enviado com sucesso para <#${announcementChannelId}>!` });
}
                if (interaction.customId === 'menu_selecionar_recrutador') {
                    const recrutadorId = interaction.values[0];
                    const modal = new ModalBuilder().setCustomId(`mod_conscrito_${recrutadorId}`).setTitle('Seus Dados na Cidade');
                    modal.addComponents(
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('set_fivem').setLabel('ID em Game / Passaporte').setStyle(TextInputStyle.Short).setRequired(true)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('set_nome').setLabel('Seu QRA').setStyle(TextInputStyle.Short).setRequired(true))
                    );
                    return await interaction.showModal(modal);
                }

                if (interaction.customId === 'menu_promo_cargo') {
                    const roleId = interaction.values?.[0];
                    if (!roleId) return await interaction.reply({ content: '❌ Nenhum cargo selecionado.', flags: 64 });

                    const modal = new ModalBuilder().setCustomId(`modal_promo_${roleId}`).setTitle('Registro de Promoção');
                    modal.addComponents(
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('nome_fivem').setLabel('Nome no FiveM').setStyle(TextInputStyle.Short).setRequired(true)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('promo_fivem').setLabel('Passaporte').setStyle(TextInputStyle.Short).setRequired(true)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('promo_sigla').setLabel('Sigla').setStyle(TextInputStyle.Short).setRequired(true)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('promo_discord').setLabel('ID Discord').setStyle(TextInputStyle.Short).setRequired(true)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('promo_motivo').setLabel('Motivo').setStyle(TextInputStyle.Paragraph).setRequired(true))
                    );
                    return await interaction.showModal(modal);
                }

                if (interaction.customId === 'cfg_hierarquia_canal') {
                    const channelId = interaction.values[0];
                    await db.run(`INSERT INTO Config (guildId, hierarchyChannel) VALUES (?, ?) ON CONFLICT(guildId) DO UPDATE SET hierarchyChannel = excluded.hierarchyChannel`, [interaction.guildId, channelId]);
                    return await interaction.reply({ content: `✅ Canal da hierarquia definido para <#${channelId}>.`, flags: 64 });
                }

                if (interaction.customId === 'cfg_chan_approval') {
                    const channelId = interaction.values[0];
                    await db.run(`INSERT INTO Config (guildId, approvalChannel) VALUES (?, ?) ON CONFLICT(guildId) DO UPDATE SET approvalChannel = excluded.approvalChannel`, [interaction.guildId, channelId]);
                    return await interaction.reply({ content: '✅ Canal de Aprovações salvo!', flags: 64 });
                }

                if (interaction.customId === 'cfg_chan_exp') {
                    const channelId = interaction.values[0];
                    await db.run(`INSERT INTO Config (guildId, expLogsChannel) VALUES (?, ?) ON CONFLICT(guildId) DO UPDATE SET expLogsChannel = excluded.expLogsChannel`, [interaction.guildId, channelId]);
                    return await interaction.reply({ content: '✅ Canal de ADVs Expiradas salvo!', flags: 64 });
                }

                if (interaction.customId === 'cfg_chan_adv') {
                    const channelId = interaction.values[0];
                    await db.run(`INSERT INTO Config (guildId, advLogsChannel) VALUES (?, ?) ON CONFLICT(guildId) DO UPDATE SET advLogsChannel = excluded.advLogsChannel`, [interaction.guildId, channelId]);
                    return await interaction.reply({ content: '✅ Canal de Advertências salvo!', flags: 64 });
                }

                if (interaction.customId === 'cfg_chan_acao') {
                    const channelId = interaction.values[0];
                    await db.run(`INSERT INTO Config (guildId, acoesLogsChannel) VALUES (?, ?) ON CONFLICT(guildId) DO UPDATE SET acoesLogsChannel = excluded.acoesLogsChannel`, [interaction.guildId, channelId]);
                    return await interaction.reply({ content: '✅ Canal de Ações pagas salvo!', flags: 64 });
                }

                if (interaction.customId === 'cfg_chan_promo') {
                    const channelId = interaction.values[0];
                    await db.run(`INSERT INTO Config (guildId, promotionLogsChannel) VALUES (?, ?) ON CONFLICT(guildId) DO UPDATE SET promotionLogsChannel = excluded.promotionLogsChannel`, [interaction.guildId, channelId]);
                    return await interaction.reply({ content: '✅ Canal de Promoções salvo!', flags: 64 });
                }

                if (interaction.customId === 'cfg_chan_exo') {
                    const channelId = interaction.values[0];
                    await db.run(`INSERT INTO Config (guildId, exoLogsChannel) VALUES (?, ?) ON CONFLICT(guildId) DO UPDATE SET exoLogsChannel = excluded.exoLogsChannel`, [interaction.guildId, channelId]);
                    return await interaction.reply({ content: '✅ Canal de Exonerações salvo!', flags: 64 });
                }

                if (interaction.customId === 'cfg_role_recruit_rank') {
                    const roleId = interaction.values[0];
                    await db.run(`INSERT INTO Config (guildId, recruitRankRole) VALUES (?, ?) ON CONFLICT(guildId) DO UPDATE SET recruitRankRole = excluded.recruitRankRole`, [interaction.guildId, roleId]);
                    return await interaction.reply({ content: '✅ Cargo de Patente Base salvo!', flags: 64 });
                }

                if (interaction.customId === 'cfg_role_recruit_org') {
                    const roleId = interaction.values[0];
                    await db.run(`INSERT INTO Config (guildId, recruitOrgRole) VALUES (?, ?) ON CONFLICT(guildId) DO UPDATE SET recruitOrgRole = excluded.recruitOrgRole`, [interaction.guildId, roleId]);
                    return await interaction.reply({ content: '✅ Cargo da Corporação salvo!', flags: 64 });
                }

                if (interaction.customId === 'cfg_role_comando_acao') {
                    const roleId = interaction.values[0];
                    await db.run(`INSERT INTO Config (guildId, cargoComando) VALUES (?, ?) ON CONFLICT(guildId) DO UPDATE SET cargoComando = excluded.cargoComando`, [interaction.guildId, roleId]);
                    return await interaction.reply({ content: '✅ Cargo de comando salvo!', flags: 64 });
                }

                if (interaction.customId === 'cfg_role_acao') {
                    const roleId = interaction.values[0];
                    await db.run(`INSERT INTO Config (guildId, cargoPolicial) VALUES (?, ?) ON CONFLICT(guildId) DO UPDATE SET cargoPolicial = excluded.cargoPolicial`, [interaction.guildId, roleId]);
                    return await interaction.reply({ content: '✅ Cargo de ação salvo!', flags: 64 });
                }

                if (interaction.customId === 'cfg_role_verbal') {
                    const roleId = interaction.values[0];
                    await db.run(`INSERT INTO Config (guildId, advVerbalRole) VALUES (?, ?) ON CONFLICT(guildId) DO UPDATE SET advVerbalRole = excluded.advVerbalRole`, [interaction.guildId, roleId]);
                    return await interaction.reply({ content: '✅ Cargo de ADV Verbal salvo!', flags: 64 });
                }

                if (interaction.customId === 'cfg_role_n1') {
                    const roleId = interaction.values[0];
                    await db.run(`INSERT INTO Config (guildId, adv1Role) VALUES (?, ?) ON CONFLICT(guildId) DO UPDATE SET adv1Role = excluded.adv1Role`, [interaction.guildId, roleId]);
                    return await interaction.reply({ content: '✅ Cargo de ADV N1 salvo!', flags: 64 });
                }

                if (interaction.customId === 'cfg_role_n2') {
                    const roleId = interaction.values[0];
                    await db.run(`INSERT INTO Config (guildId, adv2Role) VALUES (?, ?) ON CONFLICT(guildId) DO UPDATE SET adv2Role = excluded.adv2Role`, [interaction.guildId, roleId]);
                    return await interaction.reply({ content: '✅ Cargo de ADV N2 salvo!', flags: 64 });
                }

                if (interaction.customId === 'cfg_role_instrutor') {
                    const roleId = interaction.values[0];
                    await db.run(`INSERT INTO Config (guildId, cargoInstrutor) VALUES (?, ?) ON CONFLICT(guildId) DO UPDATE SET cargoInstrutor = excluded.cargoInstrutor`, [interaction.guildId, roleId]);
                    return await interaction.reply({ content: '✅ Cargo de Instrutor de Cursos salvo com sucesso!', flags: 64 });
                }

                if (interaction.customId === 'cfg_chan_curso') {
                    const channelId = interaction.values[0];
                    await db.run(`
                        INSERT INTO Config (guildId, cursoLogsChannel) 
                        VALUES (?, ?) 
                        ON CONFLICT(guildId) DO UPDATE SET cursoLogsChannel = excluded.cursoLogsChannel
                    `, [interaction.guildId, channelId]);
                    return await interaction.reply({ content: '✅ Canal de Cursos salvo com sucesso!', flags: 64 });
                }

                if (interaction.customId.startsWith('cfg_add_role_div_')) {
                    const divisionId = interaction.customId.replace('cfg_add_role_div_', '');
                    const roles = interaction.values;
                    for (const roleId of roles) {
                        await db.run('INSERT INTO DivisionRole (divisionId, roleId) VALUES (?, ?)', [divisionId, roleId]);
                    }
                    return await interaction.reply({ content: `✅ Divisão configurada com ${roles.length} cargos.`, flags: 64 });
                }

            } catch (err) {
                console.error("ERRO CRÍTICO NO SELECT MENU:", err);
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: "❌ Ocorreu um erro ao processar o menu.", flags: 64 }).catch(() => {});
                }
            }
        }

        // ==========================================
        // BOTÕES DE CURSOS (ENTRAR, SAIR, APROVAR)
        // ==========================================
        else if (interaction.isButton() && (interaction.customId?.startsWith('curso_entrar_') || interaction.customId?.startsWith('curso_sair_') || interaction.customId?.startsWith('curso_aprovar_'))) {
            const partes = interaction.customId.split('_');
            const acao = partes[1]; // 'entrar', 'sair' ou 'aprovar'
            const setupId = partes[2]; // ID numérico correto do curso
            
            const db = await getDB();
            const config = await db.get('SELECT * FROM Config WHERE guildId = ?', [interaction.guildId]); // <- Adicione esta linha
            
            const message = interaction.message;
            const embedOriginal = message.embeds[0];
            const campoInscritos = embedOriginal.fields.find(f => f.name.startsWith('👥 Inscritos'));

            if (!campoInscritos) {
                return await interaction.reply({ content: '❌ Campo de inscritos não encontrado.', ephemeral: true });
            }

            let lista = campoInscritos.value === 'Nenhum aluno inscrito ainda.' ? [] : campoInscritos.value.split('\n');
            const limiteVagas = 20;

            if (acao === 'entrar') {
                if (lista.includes(`<@${interaction.user.id}>`)) {
                    return await interaction.reply({ content: '❌ Você já está inscrito neste curso!', ephemeral: true });
                }
                if (lista.length >= limiteVagas) {
                    return await interaction.reply({ content: '⚠️ As vagas para este curso estão esgotadas!', ephemeral: true });
                }

                lista.push(`<@${interaction.user.id}>`);
                const novaEmbed = EmbedBuilder.from(embedOriginal);
                const indexCampo = novaEmbed.data.fields.findIndex(f => f.name.startsWith('👥 Inscritos'));

                novaEmbed.data.fields[indexCampo] = { 
                    name: `👥 Inscritos [${lista.length}/${limiteVagas}]`, 
                    value: lista.join('\n'), 
                    inline: false 
                };
                
                await message.edit({ embeds: [novaEmbed] });
                return await interaction.reply({ content: '✅ Inscrição realizada com sucesso!', ephemeral: true });
            }

            if (acao === 'sair') {
                if (!lista.includes(`<@${interaction.user.id}>`)) {
                    return await interaction.reply({ content: '❌ Você não está inscrito na lista deste curso.', ephemeral: true });
                }

                lista = lista.filter(user => user !== `<@${interaction.user.id}>`);
                const novaEmbed = EmbedBuilder.from(embedOriginal);
                const indexCampo = novaEmbed.data.fields.findIndex(f => f.name.startsWith('👥 Inscritos'));

                novaEmbed.data.fields[indexCampo] = { 
                    name: `👥 Inscritos [${lista.length}/${limiteVagas}]`, 
                    value: lista.length > 0 ? lista.join('\n') : 'Nenhum aluno inscrito ainda.', 
                    inline: false 
                };
                
                await message.edit({ embeds: [novaEmbed] });
                return await interaction.reply({ content: '🚪 Você saiu da lista do curso.', ephemeral: true });
            }

            if (acao === 'aprovar') {
                // 🛡️ Validação do Cargo Configurado de Instrutor
                if (config?.cargoInstrutor) {
                    if (!interaction.member.roles.cache.has(config.cargoInstrutor) && !interaction.member.permissions.has('Administrator')) {
                        return await interaction.reply({ content: `❌ Apenas oficiais com o cargo de Instrutor (<@&${config.cargoInstrutor}>) podem aprovar o curso!`, ephemeral: true });
                    }
                } else if (!interaction.member.permissions.has('ManageRoles')) {
                    return await interaction.reply({ content: '❌ Apenas administradores podem aprovar o curso (Cargo de instrutor não configurado).', ephemeral: true });
                }

                if (lista.length === 0) {
                    return await interaction.reply({ content: '❌ Não há nenhum aluno na lista para aprovar.', flags: MessageFlags.Ephemeral });
                }

                await interaction.deferReply({ flags: MessageFlags.Ephemeral });

                const db = await getDB();
                const courseRoles = await db.all('SELECT roleId FROM CourseSetupRole WHERE setupId = ?', [setupId]);
                const course = await db.get('SELECT * FROM CourseSetup WHERE id = ?', [setupId]);

                // 🛡️ PROTEÇÃO: Se o curso não for encontrado no banco, avisa o instrutor sem quebrar o bot
                if (!course) {
                    return interaction.editReply({ 
                        content: '❌ **Erro Crítico:** Os dados deste curso não foram encontrados no banco de dados (provavelmente o bot foi reiniciado após o anúncio). Crie um novo curso usando `/criar_curso`.' 
                    });
                }

                let aprovadosCount = 0;
                for (const userMention of lista) {
                    const userId = userMention.match(/\d+/)?.[0];
                    if (!userId) continue;

                    const targetMember = await interaction.guild.members.fetch(userId).catch(() => null);
                    if (targetMember && courseRoles.length > 0) {
                        const roleIdsToAdd = courseRoles.map(r => r.roleId);
                        await targetMember.roles.add(roleIdsToAdd).catch(() => {});
                        aprovadosCount++;
                    }
                }

                const novaEmbed = EmbedBuilder.from(embedOriginal)
                    .setTitle(`✅ CURSO CONCLUÍDO: ${course.name}`)
                    .setColor('#00FF00')
                    .addFields({ name: '👑 Aprovado por', value: `<@${interaction.user.id}>`, inline: false });

                await message.edit({ embeds: [novaEmbed], components: [] });
                return await interaction.editReply({ content: `✅ Curso finalizado! Cargos entregues com sucesso para ${aprovadosCount} alunos.` });
            }
        }

        // ==========================================
        // PUNIÇÕES E ADVERTÊNCIAS (MODAL SUBMIT)
        // ==========================================
        else if (interaction.isModalSubmit() && interaction.customId === 'modal_adv') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const rawUserInput = interaction.fields.getTextInputValue('input_adv_user');
            const targetUserId = rawUserInput.replace(/\D/g, '');
            const fivemId = interaction.fields.getTextInputValue('input_adv_fivem');
            const advType = interaction.fields.getTextInputValue('input_adv_type');
            const reason = interaction.fields.getTextInputValue('input_adv_reason');
            const tipoLower = advType.toLowerCase();

            if (!targetUserId || targetUserId.length < 15) return interaction.editReply({ content: '❌ ID do Discord inválido.' });
            if (targetUserId === interaction.user.id) return interaction.editReply({ content: '❌ Você não pode aplicar advertência em si mesmo.' });

            try {
                const db = await getDB();
                const config = await db.get('SELECT * FROM Config WHERE guildId = ?', [interaction.guildId]);
                const logChannelAdv = config && config.advLogsChannel ? interaction.guild.channels.cache.get(config.advLogsChannel) : null;
                const logChannelExo = config && config.exoLogsChannel ? interaction.guild.channels.cache.get(config.exoLogsChannel) : null;

                const finalReason = `[Passaporte: ${fivemId}] ${reason}`;
                const targetMember = await interaction.guild.members.fetch(targetUserId).catch(() => null);

                if (tipoLower === 'n3' || tipoLower === '3') {
                    if (!interaction.guild.members.me.permissions.has('KickMembers')) return interaction.editReply({ content: '❌ O bot não tem permissão para expulsar.' });
                    if (targetMember) await targetMember.kick('ADV 3 - Exoneração imediata');
                    else return interaction.editReply({ content: '❌ Membro não encontrado no servidor.' });

                    if (logChannelExo) {
                        const embedKick = new EmbedBuilder()
                            .setTitle('🚨 EXONERAÇÃO IMEDIATA (ADV 3)')
                            .setColor('#FF0000')
                            .addFields(
                                { name: '👤 Oficial Exonerado', value: `<@${targetUserId}>\nPassaporte: \`${fivemId}\``, inline: true },
                                { name: '🛡️ Autoridade', value: `<@${interaction.user.id}>`, inline: true },
                                { name: '📝 Relatório', value: `>>> ${reason}`, inline: false }
                            );
                        await logChannelExo.send({ embeds: [embedKick] });
                    }
                    return interaction.editReply({ content: `🚨 <@${targetUserId}> foi exonerado imediatamente.` });
                }

                let diasParaExpirar = 0;
                let roleIdToAdd = null;

                if (tipoLower.includes('verbal')) { diasParaExpirar = 3; roleIdToAdd = config?.advVerbalRole; }
                else if (tipoLower.includes('1')) { diasParaExpirar = 7; roleIdToAdd = config?.adv1Role; }
                else if (tipoLower.includes('2')) { diasParaExpirar = 15; roleIdToAdd = config?.adv2Role; }
                else { return interaction.editReply({ content: '❌ Tipo de ADV inválido.' }); }

                const expiresAt = new Date();
                expiresAt.setDate(expiresAt.getDate() + diasParaExpirar);

                if (roleIdToAdd && targetMember) {
                    await targetMember.roles.add(roleIdToAdd).catch(() => {});
                }

                await db.run('INSERT OR IGNORE INTO PoliceProfile (guildId, userId) VALUES (?, ?)', [interaction.guildId, targetUserId]);
                await db.run('INSERT INTO Advertencia (guildId, userId, moderatorId, type, reason, expiresAt, active) VALUES (?, ?, ?, ?, ?, ?, 1)', [
                    interaction.guildId, targetUserId, interaction.user.id, advType.toUpperCase(), finalReason, expiresAt.toISOString()
                ]);

                if (logChannelAdv) {
                    const logEmbed = new EmbedBuilder()
                        .setTitle(`📌 ADVERTÊNCIA APLICADA: ${advType.toUpperCase()}`)
                        .setColor('#FF4500')
                        .addFields(
                            { name: '👤 Oficial', value: `<@${targetUserId}>`, inline: true },
                            { name: '🛡️ Corregedor', value: `<@${interaction.user.id}>`, inline: true },
                            { name: '📝 Relatório', value: `>>> ${reason}`, inline: false }
                        );
                    await logChannelAdv.send({ embeds: [logEmbed] });
                }

                return await interaction.editReply({ content: '✅ Ação disciplinar registrada com sucesso.' });
            } catch (error) {
                console.error("Erro ao processar advertência:", error);
                await interaction.editReply({ content: '❌ Ocorreu um erro ao registrar a advertência.' }).catch(() => {});
            }
        }

        // ==========================================
        // PROMOÇÕES E CADASTRO DE CONSCRITO
        // ==========================================
        else if (interaction.isButton() && interaction.customId === 'painel_promocao') {
            const cargoMenu = new RoleSelectMenuBuilder().setCustomId('menu_promo_cargo').setPlaceholder('Selecione o NOVO cargo').setMaxValues(1);
            await interaction.reply({ content: '⭐ **Nova Promoção**', components: [new ActionRowBuilder().addComponents(cargoMenu)], flags: MessageFlags.Ephemeral });
        }
        else if (interaction.customId === 'btn_iniciar_conscrito') {
            const { UserSelectMenuBuilder } = await import('discord.js');
            const userMenu = new UserSelectMenuBuilder().setCustomId('menu_selecionar_recrutador').setPlaceholder('Selecione quem recrutou você').setMaxValues(1);
            await interaction.reply({ content: '🛡️ **Bem-vindo à Polícia Federal!** Selecione o recrutador:', components: [new ActionRowBuilder().addComponents(userMenu)], flags: MessageFlags.Ephemeral });
        }
        else if (interaction.isModalSubmit() && interaction.customId.startsWith('mod_conscrito_')) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const recrutadorId = interaction.customId.replace('mod_conscrito_', '');
            const db = await getDB();
            const config = await db.get('SELECT * FROM Config WHERE guildId = ?', [interaction.guildId]);

            if (!config || !config.approvalChannel) return interaction.editReply({ content: '❌ Canal de aprovações não configurado.' });
            const canalAprovacao = interaction.guild.channels.cache.get(config.approvalChannel);
            if (!canalAprovacao) return interaction.editReply({ content: '❌ Canal de aprovação não encontrado.' });

            const embedAprovacao = new EmbedBuilder()
                .setTitle('⏳ Nova Solicitação de Cadastro')
                .setColor('#FFA500')
                .addFields(
                    { name: '👤 Conscrito', value: `<@${interaction.user.id}>`, inline: true },
                    { name: '🛂 Passaporte', value: interaction.fields.getTextInputValue('set_fivem'), inline: true },
                    { name: '📝 QRA', value: interaction.fields.getTextInputValue('set_nome'), inline: true },
                    { name: '📋 Recrutador', value: `<@${recrutadorId}>`, inline: true }
                );

            const botoes = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_aprovar_conscrito').setLabel('Aprovar').setStyle(ButtonStyle.Success).setEmoji('✅'),
                new ButtonBuilder().setCustomId('btn_reprovar_conscrito').setLabel('Reprovar').setStyle(ButtonStyle.Danger).setEmoji('❌')
            );

            await canalAprovacao.send({ embeds: [embedAprovacao], components: [botoes] });
            await interaction.editReply({ content: '✅ Ficha enviada para análise!' });
        }
        else if (interaction.customId === 'btn_reprovar_conscrito') {
            if (!interaction.member.permissions.has('Administrator')) return interaction.reply({ content: '❌ Sem permissão.', flags: MessageFlags.Ephemeral });
            const embedReprovada = EmbedBuilder.from(interaction.message.embeds[0]).setTitle('❌ Setagem Reprovada').setColor('#FF0000');
            await interaction.update({ embeds: [embedReprovada], components: [] });
        }
        else if (interaction.customId === 'btn_aprovar_conscrito') {
            if (!interaction.member.permissions.has('Administrator')) return interaction.reply({ content: '❌ Sem permissão.', flags: MessageFlags.Ephemeral });
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const db = await getDB();
            const config = await db.get('SELECT * FROM Config WHERE guildId = ?', [interaction.guildId]);
            const roleId = config?.recruitRankRole;
            const cargoOrgId = config?.recruitOrgRole;

            if (!roleId) return interaction.editReply({ content: '❌ Cargo de patente base não configurado!' });

            const message = interaction.message;
            const embedOriginal = message.embeds[0];
            const conscritoId = embedOriginal.fields.find(f => f.name.includes('Conscrito'))?.value.match(/\d+/)[0];
            const fivemId = embedOriginal.fields.find(f => f.name.includes('Passaporte'))?.value;
            const nome = embedOriginal.fields.find(f => f.name.includes('QRA'))?.value;

            const targetMember = await interaction.guild.members.fetch(conscritoId).catch(() => null);
            if (!targetMember) return interaction.editReply({ content: '❌ Membro não encontrado.' });

            try {
                const rolesToAdd = [interaction.guild.roles.cache.get(roleId)];
                const cargoOrg = interaction.guild.roles.cache.get(cargoOrgId);
                if (cargoOrg) rolesToAdd.push(cargoOrg);

                await targetMember.roles.add(rolesToAdd);
                await targetMember.setNickname(`[EST] ${nome} | ${fivemId}`.substring(0, 32)).catch(() => {});
            } catch (err) {
                return interaction.editReply({ content: '❌ Erro ao atribuir cargos ou apelido.' });
            }

            const embedAprovada = EmbedBuilder.from(embedOriginal).setTitle('✅ Cadastro Aprovado').setColor('#00FF00');
            await message.edit({ embeds: [embedAprovada], components: [] });
            await interaction.editReply({ content: '✅ Oficial aprovado com sucesso!' });
        }
        else if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_promo_')) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const novoCargoId = interaction.customId.replace('modal_promo_', '');
            const cargoDiscord = interaction.guild.roles.cache.get(novoCargoId);
            const cargoNome = cargoDiscord ? cargoDiscord.name : 'Desconhecido';

            const fivemId = interaction.fields.getTextInputValue('promo_fivem');
            const nomeFivem = interaction.fields.getTextInputValue('nome_fivem');
            const sigla = interaction.fields.getTextInputValue('promo_sigla');
            const discordId = interaction.fields.getTextInputValue('promo_discord').replace(/\D/g, '');
            const motivo = interaction.fields.getTextInputValue('promo_motivo');

            try {
                const targetMember = await interaction.guild.members.fetch(discordId).catch(() => null);
                if (!targetMember) return interaction.editReply('❌ Membro não encontrado.');

                const db = await getDB();
                await db.run('INSERT OR IGNORE INTO PoliceProfile (guildId, userId) VALUES (?, ?)', [interaction.guildId, discordId]);
                await db.run('INSERT INTO Promotion (guildId, userId, moderatorId, oldRoleId, newRoleId, type) VALUES (?, ?, ?, ?, ?, ?)', [
                    interaction.guildId, discordId, interaction.user.id, '0', novoCargoId, motivo
                ]);

                if (targetMember && cargoDiscord) {
                    await targetMember.roles.add(cargoDiscord).catch(() => {});
                    await targetMember.setNickname(`[${sigla}] ${nomeFivem} | ${fivemId}`.substring(0, 32)).catch(() => {});
                }

                const config = await db.get('SELECT * FROM Config WHERE guildId = ?', [interaction.guildId]);
                if (config?.promotionLogsChannel) {
                    const logChannel = interaction.guild.channels.cache.get(config.promotionLogsChannel);
                    if (logChannel) {
                        const embed = new EmbedBuilder()
                            .setTitle('⭐ PROMOÇÃO REALIZADA')
                            .setColor('#FFD700')
                            .addFields(
                                { name: '👤 Policial', value: `<@${discordId}>`, inline: true },
                                { name: '⬆️ Novo Cargo', value: `<@&${novoCargoId}>`, inline: true },
                                { name: '📝 Motivo', value: `>>> ${motivo}`, inline: false }
                            );
                        await logChannel.send({ embeds: [embed] });
                    }
                }
                await interaction.editReply({ content: `✅ Promoção de <@${discordId}> para **${cargoNome}** registrada!` });
            } catch (err) {
                await interaction.editReply({ content: '❌ Erro ao registrar promoção.' });
            }
        }
    }
};