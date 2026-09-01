import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

let dbInstance = null;

export async function getDB() {
    if (dbInstance) return dbInstance;

    // Abre a conexão com o arquivo SQLite (ele será criado na raiz do projeto)
    dbInstance = await open({
        filename: './database.sqlite',
        driver: sqlite3.Database
    });

    // ==========================================
    // CRIAÇÃO DAS TABELAS (Equivalente ao schema.prisma)
    // ==========================================
    await dbInstance.exec(`
        -- Tabela Config
        CREATE TABLE IF NOT EXISTS Config (
            guildId TEXT PRIMARY KEY,
            advLogsChannel TEXT,
            promotionLogsChannel TEXT,
            exonerationLogsChannel TEXT,
            hierarchyChannel TEXT,
            exoLogsChannel TEXT,
            expLogsChannel TEXT,
            approvalChannel TEXT,
            advVerbalRole TEXT,
            adv1Role TEXT,
            adv2Role TEXT,
            exoneratedRole TEXT,
            recruitRankRole TEXT,
            recruitOrgRole TEXT,
            acoesLogsChannel TEXT,
            cargoPolicial TEXT,
            cargoComando TEXT,
            cursoLogsChannel TEXT,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Tabela PoliceProfile
        CREATE TABLE IF NOT EXISTS PoliceProfile (
            guildId TEXT,
            userId TEXT,
            currentRoleId TEXT,
            divisionId TEXT,
            joinedAt DATETIME,
            observations TEXT,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (guildId, userId)
        );

        -- Tabela Advertencia (id alterado para INTEGER AUTOINCREMENT)
        CREATE TABLE IF NOT EXISTS Advertencia (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guildId TEXT,
            userId TEXT,
            moderatorId TEXT,
            type TEXT,
            reason TEXT,
            expiresAt DATETIME,
            active INTEGER DEFAULT 1,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Tabela Promotion (id alterado para INTEGER AUTOINCREMENT)
        CREATE TABLE IF NOT EXISTS Promotion (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guildId TEXT,
            userId TEXT,
            moderatorId TEXT,
            oldRoleId TEXT,
            newRoleId TEXT,
            type TEXT,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Tabela Exoneration
        CREATE TABLE IF NOT EXISTS Exoneration (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guildId TEXT,
            userId TEXT,
            moderatorId TEXT,
            reason TEXT,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Tabela Division
        CREATE TABLE IF NOT EXISTS Division (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guildId TEXT,
            name TEXT,
            emoji TEXT,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Tabela DivisionRole
        CREATE TABLE IF NOT EXISTS DivisionRole (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            divisionId INTEGER,
            roleId TEXT,
            FOREIGN KEY (divisionId) REFERENCES Division(id) ON DELETE CASCADE
        );

        -- ==========================================
        -- TABELAS DE CURSOS (Adicionadas para corrigir o erro)
        -- ==========================================
        CREATE TABLE IF NOT EXISTS CourseSetup (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guildId TEXT,
            name TEXT,
            horario TEXT,
            voiceChannelId TEXT,
            messageId TEXT,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS CourseSetupRole (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            setupId INTEGER,
            roleId TEXT,
            FOREIGN KEY (setupId) REFERENCES CourseSetup(id) ON DELETE CASCADE
        );
    `);

    console.log('✅ Banco de dados SQLite conectado e tabelas sincronizadas!');
    return dbInstance;
}