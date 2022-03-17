const Helper = require('./shared/helper');

require('dotenv').config();

(async () => {
    try {
        if (process.argv[2] == 'server') {
            const Server = require('./server/server');
            const server = new Server();
            await server.start();
        }
        else {
            const Client = require('./client/client');
            
            const client = new Client({
                url: 'mtp://user:password@localhost:1025'
            });

            client.connect();

            client.on('identified', async () => {
                await client.create_queue('test', 1000, response => {
                    console.log('Created queue', response);
                });

                for (let i = 0; i < 256; ++i)
                    await client.produce('test', 'hohohoho', 1);

                await client.count_queue('test', response => {
                    console.log('Counted queue', response);
                });

                await client.purge_queue('test', response => {
                    console.log('Purged queue', response);
                });

                // await client.delete_queue('test', response => {
                //     console.log('Deleted queue', response);
                // });

                client.subscribe('todo', message => {
                    console.log(message);
                });

                // setInterval(() => {
                //     client.consume('test', data => {
                //         console.log(data);
                //     });
                // }, 3)
            });

            //await client.disconnect();
        }
    }
    catch (error) {
        console.log(error);
    }
})();
