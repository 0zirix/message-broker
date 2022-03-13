require('dotenv').config();

const helper = require('./helper');
const cluster = require('cluster');
const cpus = process.env.CPUS || require("os").cpus().length;

(async () => {
    try {
        if (process.argv[2] == 'server') {
            if (cluster.isMaster) {
                console.log(`Master ${process.pid} is running`);

                // Fork workers.
                for (let i = 0; i < cpus; ++i)
                    cluster.fork();

                cluster.on('exit', (worker, code, signal) => {
                    console.log(`worker ${worker.process.pid} died`, code, signal);
                    console.log(`Let's fork another worker!`);
                    cluster.fork();
                });
            }
            else {
                const Server = require('./server');
                const server = new Server();

                await server.start();
                console.log(`Worker ${process.pid} started`);
            }
        }
        else {
            const Client = require('./client');
            const client = new Client();

            await client.connect();

            let i = 0;
            client.subscribe('todo', message => {
                console.log(++i, message);
            });

            setInterval(() => {
                client.consume('test', data => {
                    console.log(data);
                });
            }, 3)

            //await client.disconnect();
        }
    }
    catch (error) {
        console.log(error);
    }
})();
