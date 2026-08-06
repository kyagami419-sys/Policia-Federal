import 'dotenv/config';

import {
    Client,
    Collection,
    GatewayIntentBits
} from 'discord.js';

import { loadEvents } from './handlers/eventHandler.js';

import { loadCommands } from './handlers/commandHandler.js';
import { loadButtons } from './handlers/buttonHandler.js';
import { loadModals } from './handlers/modalHandler.js';
import { loadSelects } from './handlers/selectHandler.js';
import { iniciarLoopHierarquia } from './services/hierarchy.js';
import { iniciarLimpezaAutomatica } from './services/cleanup.js';

import { deployCommands } from './loaders/deployCommands.js';

const client = new Client({

    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ]
});

client.commands = new Collection();
client.buttons = new Collection();
client.modals = new Collection();
client.selects = new Collection();

const commands =
    await loadCommands(client);

await loadButtons(client);
await loadModals(client);
await loadSelects(client);
await deployCommands(commands);

await loadEvents(client);

client.login(process.env.TOKEN || process.env.DISCORD_TOKEN).then(() => {
    iniciarLoopHierarquia(client);
    iniciarLimpezaAutomatica(client); // Inicia o faxineiro quando o bot logar
});
