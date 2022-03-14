require('dotenv').config();

(async () => {
    try {
        if (process.argv[2] == 'server') {
            const Server = require('./server');
            const server = new Server();
            await server.start();
        }
        else {
            const Client = require('./client');
            const client = new Client();
            client.connect();

            client.on('ready', async () => {
                // await client.create_queue('omgitworks');
                // await client.delete_queue('test');
                await client.purge_queue('test')

                client.subscribe('todo', message => {
                    console.log(message);
                });

                setInterval(() => {
                    client.consume('test', data => {
                        console.log(data);
                    });
                }, 3)
            });

            //await client.disconnect();
        }
    }
    catch (error) {
        console.log(error);
    }
})();
