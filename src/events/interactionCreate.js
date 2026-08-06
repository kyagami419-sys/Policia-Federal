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
        if (interaction.isButton() && interaction.customId?.startsWith('acao_')) {

            // 1. Busca as configurações no banco de dados
            const db = await getDB(); // Garanta que o getDB foi importado no topo do arquivo!
            const config = await db.get('SELECT * FROM Config WHERE guildId = ?', [interaction.guildId]);

            // ==========================================
            // BLOCO 1: PARTICIPAR E SAIR DA AÇÃO
            // ==========================================
            if (interaction.customId.startsWith('acao_entrar_') || interaction.customId === 'acao_sair') {

                // 🔒 TRAVA: Verifica se a pessoa tem o cargo de Policial
                if (config?.cargoPolicial && !interaction.member.roles.cache.has(config.cargoPolicial)) {
                    return await interaction.reply({ content: `❌ Você precisa do cargo <@&${config.cargoPolicial}> para participar de ações!`, ephemeral: true });
                }

                const message = interaction.message;
                const embedOriginal = message.embeds[0];
                const campoParticipantes = embedOriginal.fields.find(f => f.name.startsWith('👮 Participantes'));
                let lista = campoParticipantes.value === 'Nenhum oficial na lista ainda.' ? [] : campoParticipantes.value.split('\n');

                // Lógica de Entrar
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

                // Lógica de Sair
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

            // ==========================================
            // BLOCO 2: FINALIZAR AÇÃO (VITÓRIA / DERROTA)
            // ==========================================
            if (interaction.customId === 'acao_vitoria' || interaction.customId === 'acao_derrota') {

                // 🔒 TRAVA: Verifica se a pessoa tem o cargo de Comando
                if (config?.cargoComando) {
                    if (!interaction.member.roles.cache.has(config.cargoComando)) {
                        return await interaction.reply({ content: `❌ Apenas oficiais do Comando (<@&${config.cargoComando}>) podem finalizar a ação!`, ephemeral: true });
                    }
                } else if (!interaction.member.permissions.has('ManageMessages')) {
                    // Se o cargo não foi configurado no banco ainda, ele usa a permissão como backup
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
            const advMenu = new ChannelSelectMenuBuilder()
                .setCustomId('cfg_chan_adv')
                .setPlaceholder('Canal: Logs de Advertências (N1, N2, Verbal)')
                .setChannelTypes(ChannelType.GuildText);

            const promoMenu = new ChannelSelectMenuBuilder()
                .setCustomId('cfg_chan_promo')
                .setPlaceholder('Canal: Logs de Promoções')
                .setChannelTypes(ChannelType.GuildText);

            const exoMenu = new ChannelSelectMenuBuilder()
                .setCustomId('cfg_chan_exo')
                .setPlaceholder('Canal: Logs de Exoneração (ADV 3)')
                .setChannelTypes(ChannelType.GuildText);

            const approvalMenu = new ChannelSelectMenuBuilder()
                .setCustomId('cfg_chan_approval')
                .setPlaceholder('Canal: Aprovação de Setagens')
                .addChannelTypes(ChannelType.GuildText);

            const expMenu = new ChannelSelectMenuBuilder()
                .setCustomId('cfg_chan_exp')
                .setPlaceholder('Canal: Logs de ADVs Expiradas')
                .setChannelTypes(ChannelType.GuildText);

            const acaoLog = new ChannelSelectMenuBuilder()
                .setCustomId('cfg_chan_acao')
                .setPlaceholder('Canal: Logs de ações pagas')
                .setChannelTypes(ChannelType.GuildText);

            // PARTE 1: Atualiza a mensagem principal com os 5 primeiros menus (Limite do Discord)
            await interaction.update({
                content: '📂 **Configuração de Canais (Parte 1)**\nSelecione os canais abaixo. O salvamento é automático ao escolher!',
                components: [
                    new ActionRowBuilder().addComponents(advMenu),
                    new ActionRowBuilder().addComponents(promoMenu),
                    new ActionRowBuilder().addComponents(exoMenu),
                    new ActionRowBuilder().addComponents(expMenu),
                    new ActionRowBuilder().addComponents(approvalMenu)
                ]
            });

            // PARTE 2: Envia uma nova mensagem silenciosa logo abaixo com o 6º menu
            await interaction.followUp({
                content: '📂 **Configuração de Canais (Parte 2)**\nSelecione o canal para logs de Ações Táticas:',
                components: [
                    new ActionRowBuilder().addComponents(acaoLog)
                ],
                ephemeral: true // Deixa invisível só para quem clicou
            });
        }
        // ==========================================
        // X. MENU INTERATIVO DE HIERARQUIA
        // ==========================================
        else if (interaction.isButton() && interaction.customId === 'painel_hierarquia') {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('hierarquia_atualizar').setLabel('Atualizar').setStyle(ButtonStyle.Success).setEmoji('🔄'),
                new ButtonBuilder().setCustomId('hierarquia_config').setLabel('Configurar Canal').setStyle(ButtonStyle.Secondary).setEmoji('📍'),
                new ButtonBuilder().setCustomId('hierarquia_nova_div').setLabel('Criar Divisão').setStyle(ButtonStyle.Primary).setEmoji('➕')
            );

            await interaction.reply({
                content: '🏛️ **Gestão de Hierarquia**\nEscolha uma ação abaixo:',
                components: [row],
                flags: MessageFlags.Ephemeral
            });
        }

        // 1. AÇÃO: ATUALIZAR
        else if (interaction.isButton() && interaction.customId === 'hierarquia_atualizar') {
            // DEFER IMEDIATO: Isso diz ao Discord "recebi, estou trabalhando, não me mate"
            await interaction.deferUpdate();

            try {
                const { atualizarHierarquia } = await import('../services/hierarchy.js');

                const db = await getDB(); // Conecta no banco
                const config = await db.get('SELECT * FROM Config WHERE guildId = ?', [interaction.guildId]);

                if (!config || !config.hierarchyChannel) {
                    // Se não configurou, usamos followUp porque deferUpdate já "abriu" a interação
                    return await interaction.followUp({ content: '❌ Erro: Configure o canal primeiro!', flags: 64 });
                }

                await atualizarHierarquia(client, interaction.guildId);

                // Como usamos deferUpdate, não precisamos de editReply, a interação foi "limpa"
                console.log("✅ Hierarquia atualizada com sucesso.");
            } catch (error) {
                console.error("ERRO AO ATUALIZAR HIERARQUIA:", error);
                await interaction.followUp({ content: '❌ Erro ao atualizar.', flags: 64 });
            }
        }

        // 2. AÇÃO: CONFIGURAR CANAL (SELECT MENU)
        else if (interaction.isButton() && interaction.customId === 'hierarquia_config') {
            const canalMenu = new ChannelSelectMenuBuilder()
                .setCustomId('cfg_hierarquia_canal')
                .setPlaceholder('Selecione o canal para o quadro')
                .setChannelTypes(ChannelType.GuildText);

            await interaction.reply({
                content: '📍 Selecione o canal onde o quadro de hierarquia será exibido:',
                components: [new ActionRowBuilder().addComponents(canalMenu)],
                flags: MessageFlags.Ephemeral
            });
        }

        // 3. AÇÃO: CRIAR DIVISÃO (ABRE MODAL)
        else if (interaction.isButton() && interaction.customId === 'hierarquia_nova_div') {
            const modal = new ModalBuilder()
                .setCustomId('modal_nova_div')
                .setTitle('Nova Divisão');

            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('div_nome').setLabel('Nome da Divisão').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('div_emoji').setLabel('Emoji').setPlaceholder('Ex: 🚓').setStyle(TextInputStyle.Short).setRequired(true))
            );
            await interaction.showModal(modal);
        }

        // 4. PROCESSAR CRIAÇÃO E ABRIR MENU DE CARGOS
        else if (interaction.isModalSubmit() && interaction.customId === 'modal_nova_div') {
            const nome = interaction.fields.getTextInputValue('div_nome');
            const emoji = interaction.fields.getTextInputValue('div_emoji');

            // Salva a divisão no banco
            const resultado = await db.run(
                'INSERT INTO Division (guildId, name, emoji) VALUES (?, ?, ?)',
                [interaction.guildId, nome, emoji]
            );

            // 2. Recupera o objeto recém-criado usando o ID gerado (lastID)
            const novaDiv = await db.get(
                'SELECT * FROM Division WHERE id = ?',
                [resultado.lastID]
            );

            // Abre o menu para selecionar os cargos desta divisão
            const cargoMenu = new RoleSelectMenuBuilder()
                .setCustomId(`cfg_add_role_div_${novaDiv.id}`) // Passa o ID da divisão no CustomId
                .setPlaceholder('Selecione os cargos para esta divisão')
                .setMinValues(1)
                .setMaxValues(10);

            await interaction.reply({
                content: `✅ Divisão **${nome}** criada! Agora selecione os cargos que pertencem a ela:`,
                components: [new ActionRowBuilder().addComponents(cargoMenu)],
                flags: MessageFlags.Ephemeral
            });
        }

        // ==========================================
        // 1.2 GERAR MENUS DE CARGOS
        // ==========================================
        // ==========================================
        // 1.2 GERAR MENUS DE CARGOS (Punições + Recrutamento)
        // ==========================================
        else if (interaction.isButton() && interaction.customId === 'btn_config_cargos') {
            const verbalMenu = new RoleSelectMenuBuilder().setCustomId('cfg_role_verbal').setPlaceholder('Selecione o Cargo: ADV Verbal');
            const n1Menu = new RoleSelectMenuBuilder().setCustomId('cfg_role_n1').setPlaceholder('Selecione o Cargo: ADV N1');
            const n2Menu = new RoleSelectMenuBuilder().setCustomId('cfg_role_n2').setPlaceholder('Selecione o Cargo: ADV N2');

            // Novos menus de setagem
            const recruitRankMenu = new RoleSelectMenuBuilder().setCustomId('cfg_role_recruit_rank').setPlaceholder('Setagem: Cargo Patente Base (ex: Cadete)');
            const recruitOrgMenu = new RoleSelectMenuBuilder().setCustomId('cfg_role_recruit_org').setPlaceholder('Setagem: Cargo Corporação (ex: Polícia Federal)');
            const roleCmdAcao = new RoleSelectMenuBuilder().setCustomId('cfg_role_comando_acao').setPlaceholder('cargo que ira ter a permissão de gerenciar painel de ação');
            const roleAcao = new RoleSelectMenuBuilder().setCustomId('cfg_role_acao').setPlaceholder('cargo universal que ira participar das ações');

            // PARTE 1: Atualiza a principal com os 5 primeiros cargos
            await interaction.update({
                content: '🏷️ **Configuração de Cargos (Parte 1)**\nSelecione os cargos abaixo. O salvamento é automático!',
                components: [
                    new ActionRowBuilder().addComponents(verbalMenu), // (Substitua pelos nomes originais das suas variáveis)
                    new ActionRowBuilder().addComponents(n1Menu),
                    new ActionRowBuilder().addComponents(n2Menu),
                    new ActionRowBuilder().addComponents(recruitRankMenu),
                    new ActionRowBuilder().addComponents(recruitOrgMenu)
                ]
            });

            // PARTE 2: Solta o restante na mensagem de baixo
            await interaction.followUp({
                content: '🏷️ **Configuração de Cargos (Parte 2)**\nSelecione os cargos para Ações Táticas:',
                components: [
                    new ActionRowBuilder().addComponents(roleAcao), // Ex: menu do cargoPolicial
                    new ActionRowBuilder().addComponents(roleCmdAcao)  // Ex: menu do cargoComando
                ],
                ephemeral: true // Deixa invisível só para o configurador
            });
        }
        // ==========================================
        // 2. OUVINTE DE SELECT MENUS (SALVAR NO BANCO)
        // ==========================================
       // ==========================================
        // 2. OUVINTE DE SELECT MENUS (SALVAR NO BANCO)
        // ==========================================
       // ==========================================
        // 2. OUVINTE DE SELECT MENUS (SALVAR NO BANCO)
        // ==========================================
        else if (interaction.isAnySelectMenu()) {
            try {
                // 1. CONSCRITO ESCOLHEU O RECRUTADOR -> ABRE FORMULÁRIO
                if (interaction.customId === 'menu_selecionar_recrutador') {
                    const recrutadorId = interaction.values[0];
                    const modal = new ModalBuilder().setCustomId(`mod_conscrito_${recrutadorId}`).setTitle('Seus Dados na Cidade');

                    modal.addComponents(
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('set_fivem').setLabel('ID em Game / Passaporte').setStyle(TextInputStyle.Short).setRequired(true)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('set_nome').setLabel('Seu QRA (Nome e Sobrenome)').setStyle(TextInputStyle.Short).setRequired(true))
                    );
                    return await interaction.showModal(modal);
                }

                // 2. COMANDANTE ESCOLHEU O CARGO -> ABRE MODAL PEDINDO A SIGLA
                if (interaction.customId.startsWith('menu_cargo_aprov_')) {
                    const messageId = interaction.customId.replace('menu_cargo_aprov_', '');
                    const roleId = interaction.values[0];

                    const modal = new ModalBuilder().setCustomId(`mod_sigla_${messageId}_${roleId}`).setTitle('Definir Sigla');
                    modal.addComponents(
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('input_sigla').setLabel('Sigla da Patente (Ex: EST, AGT)').setPlaceholder('Digite apenas as letras. Ex: EST').setStyle(TextInputStyle.Short).setRequired(true))
                    );
                    return await interaction.showModal(modal);
                }

                // 3. REGISTRO DE PROMOÇÃO -> ABRE O MODAL COM O CARGO SELECIONADO
                if (interaction.customId === 'menu_promo_cargo') {
                    const roleId = interaction.values?.[0];
                    
                    if (!roleId) {
                        return await interaction.reply({ content: '❌ Nenhum cargo foi selecionado. Tente novamente.', flags: 64 });
                    }

                    const modal = new ModalBuilder()
                        .setCustomId(`modal_promo_${roleId}`)
                        .setTitle('Registro de Promoção');

                    modal.addComponents(
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('nome_fivem').setLabel('Nome no FiveM').setPlaceholder('Ex: Judeu Yagami').setStyle(TextInputStyle.Short).setRequired(true)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('promo_fivem').setLabel('Passaporte / ID FiveM').setPlaceholder('Ex: 1024').setStyle(TextInputStyle.Short).setRequired(true)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('promo_sigla').setLabel('Sigla que Representa a patente').setPlaceholder('Ex: SGT').setStyle(TextInputStyle.Short).setRequired(true)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('promo_discord').setLabel('ID do Discord').setPlaceholder('123456789012345678').setStyle(TextInputStyle.Short).setRequired(true)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('promo_motivo').setLabel('Motivo da Promoção').setStyle(TextInputStyle.Paragraph).setRequired(true))
                    );

                    return await interaction.showModal(modal);
                }

                // 4. SALVA CANAL DE HIERARQUIA
                if (interaction.customId === 'cfg_hierarquia_canal') {
                    const channelId = interaction.values[0];
                    const db = await getDB();
                    await db.run(`
                        INSERT INTO Config (guildId, hierarchyChannel) 
                        VALUES (?, ?)
                        ON CONFLICT(guildId) DO UPDATE SET hierarchyChannel = excluded.hierarchyChannel
                    `, [interaction.guildId, channelId]);
                    return await interaction.reply({ content: `✅ Canal da hierarquia definido para <#${channelId}>.`, flags: 64 });
                }

                // 5. SALVA CANAL DE APROVAÇÃO
                if (interaction.customId === 'cfg_chan_approval') {
                    const channelId = interaction.values[0];
                    const db = await getDB();
                    await db.run(`
                        INSERT INTO Config (guildId, approvalChannel) 
                        VALUES (?, ?)
                        ON CONFLICT(guildId) DO UPDATE SET approvalChannel = excluded.approvalChannel
                    `, [interaction.guildId, channelId]);
                    return await interaction.reply({ content: '✅ Canal de Aprovações salvo!', flags: 64 });
                }

                // 6. SALVA CANAL DE ADVS EXPIRADAS
                if (interaction.customId === 'cfg_chan_exp') {
                    const channelId = interaction.values[0];
                    const db = await getDB();
                    await db.run(`
                        INSERT INTO Config (guildId, expLogsChannel) 
                        VALUES (?, ?)
                        ON CONFLICT(guildId) DO UPDATE SET expLogsChannel = excluded.expLogsChannel
                    `, [interaction.guildId, channelId]);
                    return await interaction.reply({ content: '✅ Canal de ADVs Expiradas salvo com sucesso!', flags: 64 });
                }

                // 7. SALVA CANAL DE ADVERTÊNCIAS
                if (interaction.customId === 'cfg_chan_adv') {
                    const channelId = interaction.values[0];
                    const db = await getDB();
                    await db.run(`
                        INSERT INTO Config (guildId, advLogsChannel) 
                        VALUES (?, ?)
                        ON CONFLICT(guildId) DO UPDATE SET advLogsChannel = excluded.advLogsChannel
                    `, [interaction.guildId, channelId]);
                    return await interaction.reply({ content: '✅ Canal de Advertências salvo!', flags: 64 });
                }

                // 8. SALVA CANAL DE AÇÕES PAGAS
                if (interaction.customId === 'cfg_chan_acao') {
                    const channelId = interaction.values[0];
                    const db = await getDB();
                    await db.run(`
                        INSERT INTO Config (guildId, acoesLogsChannel) 
                        VALUES (?, ?)
                        ON CONFLICT(guildId) DO UPDATE SET acoesLogsChannel = excluded.acoesLogsChannel
                    `, [interaction.guildId, channelId]);
                    return await interaction.reply({ content: '✅ Canal de Ações pagas salvo!', flags: 64 });
                }

                // 9. SALVA CANAL DE PROMOÇÕES
                if (interaction.customId === 'cfg_chan_promo') {
                    const channelId = interaction.values[0];
                    const db = await getDB();
                    await db.run(`
                        INSERT INTO Config (guildId, promotionLogsChannel) 
                        VALUES (?, ?)
                        ON CONFLICT(guildId) DO UPDATE SET promotionLogsChannel = excluded.promotionLogsChannel
                    `, [interaction.guildId, channelId]);
                    return await interaction.reply({ content: '✅ Canal de Promoções salvo!', flags: 64 });
                }

                // 10. SALVA CANAL DE EXONERAÇÕES
                if (interaction.customId === 'cfg_chan_exo') {
                    const channelId = interaction.values[0];
                    const db = await getDB();
                    await db.run(`
                        INSERT INTO Config (guildId, exoLogsChannel) 
                        VALUES (?, ?)
                        ON CONFLICT(guildId) DO UPDATE SET exoLogsChannel = excluded.exoLogsChannel
                    `, [interaction.guildId, channelId]);
                    return await interaction.reply({ content: '✅ Canal de Exonerações salvo!', flags: 64 });
                }

                // 11. SALVA CARGOS DE RECRUTAMENTO E AÇÕES
                if (interaction.customId === 'cfg_role_recruit_rank') {
                    const roleId = interaction.values[0];
                    const db = await getDB();
                    await db.run(`
                        INSERT INTO Config (guildId, recruitRankRole) VALUES (?, ?)
                        ON CONFLICT(guildId) DO UPDATE SET recruitRankRole = excluded.recruitRankRole
                    `, [interaction.guildId, roleId]);
                    return await interaction.reply({ content: '✅ Cargo de Patente Base salvo!', flags: 64 });
                }

                if (interaction.customId === 'cfg_role_recruit_org') {
                    const roleId = interaction.values[0];
                    const db = await getDB();
                    await db.run(`
                        INSERT INTO Config (guildId, recruitOrgRole) VALUES (?, ?)
                        ON CONFLICT(guildId) DO UPDATE SET recruitOrgRole = excluded.recruitOrgRole
                    `, [interaction.guildId, roleId]);
                    return await interaction.reply({ content: '✅ Cargo da Corporação salvo!', flags: 64 });
                }

                if (interaction.customId === 'cfg_role_comando_acao') {
                    const roleId = interaction.values[0];
                    const db = await getDB();
                    await db.run(`
                        INSERT INTO Config (guildId, cargoComando) VALUES (?, ?)
                        ON CONFLICT(guildId) DO UPDATE SET cargoComando = excluded.cargoComando
                    `, [interaction.guildId, roleId]);
                    return await interaction.reply({ content: '✅ Cargo de comando de ação salvo!', flags: 64 });
                }

                if (interaction.customId === 'cfg_role_acao') {
                    const roleId = interaction.values[0];
                    const db = await getDB();
                    await db.run(`
                        INSERT INTO Config (guildId, cargoPolicial) VALUES (?, ?)
                        ON CONFLICT(guildId) DO UPDATE SET cargoPolicial = excluded.cargoPolicial
                    `, [interaction.guildId, roleId]);
                    return await interaction.reply({ content: '✅ Cargo universal de ação salvo!', flags: 64 });
                }

                if (interaction.customId === 'cfg_role_verbal') {
                    const roleId = interaction.values[0];
                    const db = await getDB();
                    await db.run(`
                        INSERT INTO Config (guildId, advVerbalRole) VALUES (?, ?)
                        ON CONFLICT(guildId) DO UPDATE SET advVerbalRole = excluded.advVerbalRole
                    `, [interaction.guildId, roleId]);
                    return await interaction.reply({ content: '✅ Cargo de ADV Verbal salvo!', flags: 64 });
                }

                if (interaction.customId === 'cfg_role_n1') {
                    const roleId = interaction.values[0];
                    const db = await getDB();
                    await db.run(`
                        INSERT INTO Config (guildId, adv1Role) VALUES (?, ?)
                        ON CONFLICT(guildId) DO UPDATE SET adv1Role = excluded.adv1Role
                    `, [interaction.guildId, roleId]);
                    return await interaction.reply({ content: '✅ Cargo de ADV N1 salvo!', flags: 64 });
                }

                if (interaction.customId === 'cfg_role_n2') {
                    const roleId = interaction.values[0];
                    const db = await getDB();
                    await db.run(`
                        INSERT INTO Config (guildId, adv2Role) VALUES (?, ?)
                        ON CONFLICT(guildId) DO UPDATE SET adv2Role = excluded.adv2Role
                    `, [interaction.guildId, roleId]);
                    return await interaction.reply({ content: '✅ Cargo de ADV N2 salvo!', flags: 64 });
                }

                // 12. DIVISÕES
                if (interaction.customId.startsWith('cfg_add_role_div_')) {
                    const divisionId = interaction.customId.replace('cfg_add_role_div_', '');
                    const roles = interaction.values;
                    const db = await getDB();
                    for (const roleId of roles) {
                        await db.run('INSERT INTO DivisionRole (divisionId, roleId) VALUES (?, ?)', [divisionId, roleId]);
                    }
                    return await interaction.reply({ content: `✅ Divisão configurada com ${roles.length} cargos.`, flags: 64 });
                }
                // 13. SETAGEM POLICIAL -> ABRE O MODAL PARA PEDIR A SIGLA OU DADOS
                if (interaction.customId === 'menu_setagem_pol_cargo') {
                    const roleId = interaction.values?.[0];
                    
                    if (!roleId) {
                        return await interaction.reply({ content: '❌ Nenhum cargo foi selecionado.', flags: 64 });
                    }

                    const modal = new ModalBuilder()
                        .setCustomId(`mod_sigla_pol_${roleId}`)
                        .setTitle('Finalizar Setagem Policial');

                    modal.addComponents(
                        new ActionRowBuilder().addComponents(
                            new TextInputBuilder()
                                .setCustomId('input_sigla_pol')
                                .setLabel('Sigla da Patente (Ex: SGT, AGT)')
                                .setStyle(TextInputStyle.Short)
                                .setRequired(true)
                        )
                    );

                    return await interaction.showModal(modal);
                }

            // ==========================================
                // 🛡️ FALLBACK DE SEGURANÇA PARA MENUS NÃO MAPEADOS
                // ==========================================
                if (!interaction.replied && !interaction.deferred) {
                    return await interaction.reply({ 
                        content: `⚠️ Este menu ainda não possui uma ação programada (${interaction.customId}).`, 
                        flags: 64 
                    }).catch(() => {});
                }

            } catch (err) {
                console.error("ERRO CRÍTICO NO SELECT MENU:", err);
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({ content: "❌ Ocorreu um erro ao processar o menu.", flags: 64 }).catch(() => {});
                }
            }
        }
        else if (interaction.customId === 'cfg_chan_promo') {
            const channelId = interaction.values[0];
            const db = await getDB();

            await db.run(`
                INSERT INTO Config (guildId, promotionLogsChannel) 
                VALUES (?, ?)
                ON CONFLICT(guildId) DO UPDATE SET promotionLogsChannel = excluded.promotionLogsChannel
            `, [interaction.guildId, channelId]);

            return await interaction.reply({ content: '✅ Canal de Promoções salvo!', flags: MessageFlags.Ephemeral });
        }
        else if (interaction.customId === 'cfg_chan_exo') {
            const channelId = interaction.values[0];
            const db = await getDB();

            await db.run(`
                INSERT INTO Config (guildId, exoLogsChannel) 
                VALUES (?, ?)
                ON CONFLICT(guildId) DO UPDATE SET exoLogsChannel = excluded.exoLogsChannel
            `, [interaction.guildId, channelId]);

            return await interaction.reply({ content: '✅ Canal de Exonerações salvo!', flags: MessageFlags.Ephemeral });
        }
        else if (interaction.customId === 'cfg_chan_exp') {
            const channelId = interaction.values[0];
            const db = await getDB();

            await db.run(`
                INSERT INTO Config (guildId, expLogsChannel) 
                VALUES (?, ?)
                ON CONFLICT(guildId) DO UPDATE SET expLogsChannel = excluded.expLogsChannel
            `, [interaction.guildId, channelId]);

            return await interaction.reply({ content: '✅ Canal de ADVs Expiradas salvo!', flags: MessageFlags.Ephemeral });
        }

        // ==========================================
        // 3. ABRIR MODAL DE ADVERTÊNCIA
        // ==========================================
        else if (interaction.isButton() && interaction.customId === 'painel_advertencias') {
            const modal = new ModalBuilder().setCustomId('modal_adv').setTitle('Aplicar Punição Disciplinar');

            // Campo 1: ID do Discord (Essencial para Kick/Cargos)
            const discordInput = new TextInputBuilder()
                .setCustomId('input_adv_user')
                .setLabel('ID do Discord do Policial')
                .setPlaceholder('Ex: 123456789012345678')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            // Campo 2: ID FiveM
            const fivemInput = new TextInputBuilder()
                .setCustomId('input_adv_fivem')
                .setLabel('Passaporte / ID FiveM')
                .setPlaceholder('Ex: 1024')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            // Campo 3: Tipo
            const typeInput = new TextInputBuilder()
                .setCustomId('input_adv_type')
                .setLabel('Nível (Verbal, N1, N2, N3)')
                .setPlaceholder('Ex: N1')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            // Campo 4: Motivo
            const reasonInput = new TextInputBuilder()
                .setCustomId('input_adv_reason')
                .setLabel('Relatório da Infração')
                .setPlaceholder('Descreva os fatos detalhadamente...')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(discordInput),
                new ActionRowBuilder().addComponents(fivemInput),
                new ActionRowBuilder().addComponents(typeInput),
                new ActionRowBuilder().addComponents(reasonInput)
            );
            await interaction.showModal(modal);
        }

        // ==========================================
        // BOTÃO DE PROMOÇÃO (ABRE MODAL)
        // ==========================================
        // ==========================================
        // BOTÃO DE PROMOÇÃO (ABRE MENU DE CARGOS)
        // ==========================================
        else if (interaction.isButton() && interaction.customId === 'painel_promocao') {
            const cargoMenu = new RoleSelectMenuBuilder()
                .setCustomId('menu_promo_cargo')
                .setPlaceholder('Selecione o NOVO cargo do oficial')
                .setMaxValues(1);

            await interaction.reply({
                content: '⭐ **Nova Promoção**\nSelecione no menu abaixo qual será a nova patente do oficial:',
                components: [new ActionRowBuilder().addComponents(cargoMenu)],
                flags: MessageFlags.Ephemeral
            });
        }

        

        // CONSCRITO INICIA O PROCESSO
        else if (interaction.customId === 'btn_iniciar_conscrito') {
            const { UserSelectMenuBuilder } = await import('discord.js');
            const userMenu = new UserSelectMenuBuilder()
                .setCustomId('menu_selecionar_recrutador')
                .setPlaceholder('Selecione quem recrutou você')
                .setMaxValues(1);

            await interaction.reply({
                content: '👋 **Olá!** Primeiro, selecione na lista o recrutador responsável:',
                components: [new ActionRowBuilder().addComponents(userMenu)],
                flags: MessageFlags.Ephemeral
            });
        }

        // COMANDANTE CLICA EM REPROVAR
        else if (interaction.customId === 'btn_reprovar_conscrito') {
            if (!interaction.member.permissions.has('Administrator')) return interaction.reply({ content: '❌ Sem permissão.', flags: MessageFlags.Ephemeral });
            const embedReprovada = EmbedBuilder.from(interaction.message.embeds[0]).setTitle('❌ Setagem Reprovada').setColor('#FF0000').addFields({ name: '🚫 Reprovado por', value: `<@${interaction.user.id}>`, inline: false });
            await interaction.update({ embeds: [embedReprovada], components: [] });
        }

        // COMANDANTE CLICA EM APROVAR (Abre menu de cargos)
        else if (interaction.customId === 'btn_aprovar_conscrito') {
            if (!interaction.member.permissions.has('Administrator')) return interaction.reply({ content: '❌ Sem permissão.', flags: MessageFlags.Ephemeral });

            const cargoMenu = new RoleSelectMenuBuilder()
                .setCustomId(`menu_cargo_aprov_${interaction.message.id}`)
                .setPlaceholder('Qual patente ele vai receber?')
                .setMaxValues(1);

            await interaction.reply({
                content: '👮 **Aprovando...**\nSelecione qual patente (cargo) este oficial deve receber agora:',
                components: [new ActionRowBuilder().addComponents(cargoMenu)],
                flags: MessageFlags.Ephemeral
            });
        }

        // ==========================================
        // 1. ABRIR MENU DA SETAGEM POLICIAL
        // ==========================================
        else if (interaction.isButton() && interaction.customId === 'btn_iniciar_setagem_pol') {
            const cargoMenu = new RoleSelectMenuBuilder()
                .setCustomId('menu_setagem_pol_cargo')
                .setPlaceholder('Selecione a patente do novo policial')
                .setMaxValues(1);

            await interaction.reply({
                content: '👮 **Setagem Policial**\nSelecione qual será a patente deste oficial:',
                components: [new ActionRowBuilder().addComponents(cargoMenu)],
                flags: MessageFlags.Ephemeral
            });
        }

        /// ==========================================
        // 4. PROCESSAR E SALVAR A ADVERTÊNCIA
        // ==========================================
        /// ==========================================
        // 4. PROCESSAR E SALVAR A ADVERTÊNCIA
        // ==========================================
        /// ==========================================
        // 4. PROCESSAR E SALVAR A ADVERTÊNCIA
        // ==========================================
        else if (interaction.isModalSubmit() && interaction.customId === 'modal_adv') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const rawUserInput = interaction.fields.getTextInputValue('input_adv_user');
            const targetUserId = rawUserInput.replace(/\D/g, '');

            const fivemId = interaction.fields.getTextInputValue('input_adv_fivem');
            const advType = interaction.fields.getTextInputValue('input_adv_type');
            const reason = interaction.fields.getTextInputValue('input_adv_reason');
            const tipoLower = advType.toLowerCase();

            // 1. Validação de ID
            if (!targetUserId || targetUserId.length < 15) {
                return interaction.editReply({ content: '❌ ID do Discord inválido.' });
            }

            // 2. Trava de Segurança (Não aplicar em si mesmo)
            if (targetUserId === interaction.user.id) {
                return interaction.editReply({ content: '❌ Você não pode aplicar advertência em si mesmo.' });
            }

            try {
                // 1. Conecta ao banco e busca as configurações
                const db = await getDB();
                const config = await db.get('SELECT * FROM Config WHERE guildId = ?', [interaction.guildId]);

                // Separa os canais buscando do banco de dados
                const logChannelAdv = config && config.advLogsChannel ? interaction.guild.channels.cache.get(config.advLogsChannel) : null;
                const logChannelExo = config && config.exoLogsChannel ? interaction.guild.channels.cache.get(config.exoLogsChannel) : null;

                const finalReason = `[Passaporte: ${fivemId}] ${reason}`;
                const targetMember = await interaction.guild.members.fetch(targetUserId).catch(() => null);
                
                // ==========================================
                // LÓGICA ADV 3: EXONERAÇÃO IMEDIATA (KICK)
                // ==========================================
                if (tipoLower === 'n3' || tipoLower === '3') {
                    if (!interaction.guild.members.me.permissions.has('KickMembers')) {
                        return interaction.editReply({ content: '❌ O bot não tem permissão para expulsar membros.' });
                    }

                    if (targetMember) {
                        await targetMember.kick('ADV 3 - Exoneração imediata');
                    } else {
                        return interaction.editReply({ content: '❌ O membro não está no servidor para ser exonerado.' });
                    }

                    if (logChannelExo) {
                        const embedKick = new EmbedBuilder()
                            .setAuthor({ name: 'Corregedoria - Exoneração Disciplinar', iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined })
                            .setTitle('🚨 EXONERAÇÃO IMEDIATA (ADV 3)')
                            .setColor('#FF0000')
                            .setThumbnail(targetMember ? targetMember.displayAvatarURL({ dynamic: true }) : null)
                            .setDescription('Um oficial atingiu o limite máximo de punições e foi **removido** da corporação e do servidor.')
                            .addFields(
                                { name: '👤 Oficial Exonerado', value: `<@${targetUserId}>\n└ **Passaporte:** \`${fivemId}\``, inline: true },
                                { name: '🛡️ Autoridade Responsável', value: `<@${interaction.user.id}>`, inline: true },
                                { name: '🛑 Ação Executada', value: '`Expulsão (Kick)`', inline: true },
                                { name: '📝 Relatório Final da Infração', value: `>>> ${reason}`, inline: false }
                            )
                            .setFooter({ text: 'Sistema de Gestão Policial', iconURL: client.user.displayAvatarURL() })
                            .setTimestamp();

                        await logChannelExo.send({ embeds: [embedKick] });
                    }

                    return interaction.editReply({ content: `🚨 <@${targetUserId}> foi **exonerado imediatamente** (ADV 3).` });
                }

                // ==========================================
                // LÓGICA ADV NORMAL (VERBAL, N1, N2)
                // ==========================================
                let diasParaExpirar = 0;
                let roleIdToAdd = null;

                if (tipoLower.includes('verbal')) {
                    diasParaExpirar = 3;
                    if (config) roleIdToAdd = config.advVerbalRole;
                } else if (tipoLower.includes('1')) {
                    diasParaExpirar = 7;
                    if (config) roleIdToAdd = config.adv1Role;
                } else if (tipoLower.includes('2')) {
                    diasParaExpirar = 15;
                    if (config) roleIdToAdd = config.adv2Role;
                } else {
                    return interaction.editReply({ content: '❌ Tipo de ADV inválido. Use: Verbal, 1, 2 ou 3.' });
                }

                const expiresAt = new Date();
                expiresAt.setDate(expiresAt.getDate() + diasParaExpirar);

                // Dá o cargo ao membro
                if (roleIdToAdd && targetMember) {
                    await targetMember.roles.add(roleIdToAdd).catch(() => console.log('Sem permissão para adicionar cargo.'));
                }

                // Salva no banco de dados SQLite
                await db.run(
                    'INSERT OR IGNORE INTO PoliceProfile (guildId, userId) VALUES (?, ?)',
                    [interaction.guildId, targetUserId]
                );

                await db.run(
                    'INSERT INTO Advertencia (guildId, userId, moderatorId, type, reason, expiresAt, active) VALUES (?, ?, ?, ?, ?, ?, 1)',
                    [
                        interaction.guildId,
                        targetUserId,
                        interaction.user.id,
                        advType.toUpperCase(),
                        finalReason,
                        expiresAt ? expiresAt.toISOString() : null
                    ]
                );

                // Embed de Punição Normal (Amarela/Laranja)
                if (logChannelAdv) {
                    const logEmbed = new EmbedBuilder()
                        .setAuthor({ name: 'Corregedoria - Registro de Punição', iconURL: interaction.guild.iconURL({ dynamic: true }) || undefined })
                        .setTitle(`📌 ADVERTÊNCIA APLICADA: ${advType.toUpperCase()}`)
                        .setColor('#FF4500')
                        .setThumbnail(targetMember ? targetMember.displayAvatarURL({ dynamic: true }) : null)
                        .setDescription('Uma nova quebra de conduta foi registrada nos arquivos da Corregedoria.')
                        .addFields(
                            { name: '👤 Oficial Infrator', value: `<@${targetUserId}>\n└ **Passaporte:** \`${fivemId}\``, inline: true },
                            { name: '🛡️ Corregedor Responsável', value: `<@${interaction.user.id}>`, inline: true },
                            { name: '📊 Nível da Punição', value: `\`ADV ${advType.toUpperCase()}\``, inline: true },
                            { name: '📝 Relatório da Infração', value: `>>> ${reason}`, inline: false },
                            { name: '⏳ Prazo de Prescrição', value: `O registro expirará <t:${Math.floor(expiresAt.getTime() / 1000)}:R>\n└ **Data Exata:** <t:${Math.floor(expiresAt.getTime() / 1000)}:f>`, inline: false }
                        )
                        .setFooter({ text: `ID do Registro: ${fivemId} | Polícia Administrativa`, iconURL: client.user.displayAvatarURL() })
                        .setTimestamp();

                    await logChannelAdv.send({ embeds: [logEmbed] });
                }

                // ✅ RESPOSTA FINAL OBRIGATÓRIA PARA TIRAR O "PENSANDO..."
                return await interaction.editReply({ content: '✅ Ação disciplinar registrada e processada com sucesso.' });

            } catch (error) {
                console.error("Erro ao processar modal de advertência:", error);
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply({ content: '❌ Ocorreu um erro ao registrar a advertência.' }).catch(() => {});
                }
            }
        }

        // ==========================================
        // PROCESSAR E SALVAR A PROMOÇÃO
        // ==========================================
        // ==========================================
        // PROCESSAR E SALVAR A PROMOÇÃO
        // ==========================================
        else if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_promo_')) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            // Puxa o ID do cargo selecionado direto do CustomID
            const novoCargoId = interaction.customId.replace('modal_promo_', '');
            const cargoDiscord = interaction.guild.roles.cache.get(novoCargoId);
            const cargoNome = cargoDiscord ? cargoDiscord.name : 'Desconhecido';

            const fivemId = interaction.fields.getTextInputValue('promo_fivem');
            const nomeFivem = interaction.fields.getTextInputValue('nome_fivem');
            const sigla = interaction.fields.getTextInputValue('promo_sigla');
            const discordId = interaction.fields.getTextInputValue('promo_discord').replace(/\D/g, '');
            const motivo = interaction.fields.getTextInputValue('promo_motivo');

            try {
                // 1. PRIMEIRO BUSCA O MEMBRO
                const targetMember = await interaction.guild.members.fetch(discordId).catch(() => null);

                if (!targetMember) {
                    return interaction.editReply('❌ Membro não encontrado no servidor.');
                }

                // 2. CONECTA AO BANCO DE DADOS
                const db = await getDB();

                // 3. GARANTE QUE O PERFIL DO POLICIAL EXISTE NO BANCO
                await db.run(
                    'INSERT OR IGNORE INTO PoliceProfile (guildId, userId) VALUES (?, ?)',
                    [interaction.guildId, discordId]
                );

                // 4. REGISTRA A PROMOÇÃO NO BANCO DE DADOS
                await db.run(
                    'INSERT INTO Promotion (guildId, userId, moderatorId, oldRoleId, newRoleId, type) VALUES (?, ?, ?, ?, ?, ?)',
                    [
                        interaction.guildId,
                        discordId,
                        interaction.user.id,
                        '0',
                        novoCargoId,
                        motivo
                    ]
                );

                // 5. ATUALIZAR CARGOS E APELIDO NO DISCORD
                if (targetMember && cargoDiscord) {
                    await targetMember.roles.add(cargoDiscord).catch(() => console.log('Sem permissão para dar cargo.'));

                    const novoApelido = `[${sigla}] ${nomeFivem} | ${fivemId}`.substring(0, 32);
                    await targetMember.setNickname(novoApelido).catch(() => console.log('Sem permissão para mudar apelido.'));
                }

                // 6. ENVIAR EMBED DE LOGS
                const config = await db.get('SELECT * FROM Config WHERE guildId = ?', [interaction.guildId]);

                if (config && config.promotionLogsChannel) {
                    const logChannel = interaction.guild.channels.cache.get(config.promotionLogsChannel);
                    if (logChannel) {
                        const embed = new EmbedBuilder()
                            .setTitle('⭐ PROMOÇÃO REALIZADA')
                            .setColor('#FFD700')
                            .setThumbnail(targetMember ? targetMember.displayAvatarURL({ dynamic: true }) : null)
                            .addFields(
                                { name: '👤 Policial', value: `<@${discordId}> \nPassaporte: \`${fivemId}\``, inline: true },
                                { name: '⬆️ Novo Cargo', value: `<@&${novoCargoId}>`, inline: true },
                                { name: '🛡️ Promovido por', value: `<@${interaction.user.id}>`, inline: true },
                                { name: '📝 Motivo', value: `>>> ${motivo}`, inline: false }
                            )
                            .setFooter({ text: 'Polícia Federal - Administração', iconURL: interaction.client.user.displayAvatarURL() })
                            .setTimestamp();
                        await logChannel.send({ embeds: [embed] });
                    }
                }
                await interaction.editReply({ content: `✅ Promoção de <@${discordId}> para **${cargoNome}** registrada com sucesso!` });
            } catch (err) {
                console.error(err);
                await interaction.editReply({ content: '❌ Erro ao registrar promoção.' });
            }
        }
        // CONSCRITO ENVIOU O FORMULÁRIO -> VAI PARA O CANAL DE APROVAÇÃO
        else if (interaction.isButton() && interaction.customId.startsWith('mod_conscrito_')) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const recrutadorId = interaction.customId.replace('mod_conscrito_', '');

            // Busca o canal de aprovação no banco
            const db = await getDB();
            const config = await db.get('SELECT * FROM Config WHERE guildId = ?', [interaction.guildId]);

            if (!config || !config.approvalChannel) return interaction.editReply({ content: '❌ O canal de aprovações não foi configurado pela administração!' });

            const canalAprovacao = interaction.guild.channels.cache.get(config.approvalChannel);
            if (!canalAprovacao) return interaction.editReply({ content: '❌ Canal de aprovação não encontrado no servidor.' });

            const embedAprovacao = new EmbedBuilder()
                .setTitle('⏳ Nova Solicitação de Cadastro')
                .setColor('#FFA500')
                // 👇 O SEGREDO ESTÁ NESTA LINHA 👇
                .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true, size: 1024 }))
                .addFields(
                    { name: '👤 Conscrito', value: `<@${interaction.user.id}>\nID: \`${interaction.user.id}\``, inline: true },
                    { name: '🛂 Passaporte', value: interaction.fields.getTextInputValue('set_fivem'), inline: true },
                    { name: '📝 QRA', value: interaction.fields.getTextInputValue('set_nome'), inline: true },
                    { name: '📋 Recrutador', value: `<@${recrutadorId}>`, inline: true }
                )
                .setFooter({ text: 'Aguardando avaliação do Comando' });

            const botoes = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_aprovar_conscrito').setLabel('Aprovar e Setar').setStyle(ButtonStyle.Success).setEmoji('✅'),
                new ButtonBuilder().setCustomId('btn_reprovar_conscrito').setLabel('Reprovar').setStyle(ButtonStyle.Danger).setEmoji('❌')
            );

            await canalAprovacao.send({ embeds: [embedAprovacao], components: [botoes] });
            await interaction.editReply({ content: '✅ Sua ficha foi enviada para análise do Comando! Acompanhe o resultado.' });
        }

        // COMANDANTE DIGITOU A SIGLA -> FINALIZA A SETAGEM!
        else if (interaction.customId?.startsWith('mod_sigla_')) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            // Extrai as IDs (mod_sigla_MESSAGEID_ROLEID)
            const partes = interaction.customId.split('_');
            const messageId = partes[2];
            const roleId = partes[3];
            const siglaDigitada = interaction.fields.getTextInputValue('input_sigla').toUpperCase();

            const message = await interaction.channel.messages.fetch(messageId).catch(() => null);
            if (!message) return interaction.editReply('❌ Mensagem original não encontrada.');

            const embedOriginal = message.embeds[0];
            const conscritoId = embedOriginal.fields.find(f => f.name === '👤 Conscrito')?.value.match(/\d+/)[0];
            const fivemId = embedOriginal.fields.find(f => f.name === '🛂 Passaporte')?.value;
            const nome = embedOriginal.fields.find(f => f.name === '📝 QRA')?.value;

            const targetMember = await interaction.guild.members.fetch(conscritoId).catch(() => null);
            const cargoPatente = interaction.guild.roles.cache.get(roleId);

            const db = await getDB();
            const config = await db.get('SELECT * FROM Config WHERE guildId = ?', [interaction.guildId]);

            const cargoOrg = interaction.guild.roles.cache.get(config?.recruitOrgRole || '0'); // Cargo da Polícia Federal
            if (targetMember && cargoPatente) {
                // Dá os cargos (Patente selecionada + Cargo geral da corporação se existir)
                if (cargoOrg) await targetMember.roles.add([cargoPatente, cargoOrg]).catch(() => { });
                else await targetMember.roles.add(cargoPatente).catch(() => { });

                // Monta o apelido final: [SIGLA] Nome | Passaporte
                const novoApelido = `[${siglaDigitada}] ${nome} | ${fivemId}`.substring(0, 32);
                await targetMember.setNickname(novoApelido).catch(() => { });
            }

            // ✅ O JEITO CERTO DE ADICIONAR O FOOTER
            const embedAprovada = EmbedBuilder.from(embedOriginal)
                .setTitle('✅ Cadastro Aprovado')
                .setColor('#00FF00')
                .addFields(
                    { name: '👑 Aprovado por', value: `<@${interaction.user.id}>`, inline: false },
                    { name: '🎖️ Cargo Entregue', value: `<@&${roleId}>`, inline: true },
                    { name: '🏷️ Nova Sigla', value: `\`[${siglaDigitada}]\``, inline: true }
                )
                .setFooter({ text: 'Polícia Federal - Sistema de Registros' }); // <-- Coloque o Footer AQUI, grudado na Embed!

            // E o envio fica limpo, só entregando o que já foi montado:
            await message.edit({ embeds: [embedAprovada], components: [] });
            await interaction.editReply({ content: '✅ Oficial setado com sucesso!' });
        }
    }
}
