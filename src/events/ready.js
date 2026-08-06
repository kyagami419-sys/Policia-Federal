export default {
    name: 'clientReady',
    once: true,

    async execute(client) {

        console.log(
            `✅ ${client.user.tag} iniciado`
        );
    }
};