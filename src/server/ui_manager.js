const path = require('path');
const http = require('http');
const express = require('express');
const SocketIo = require("socket.io");
const SocketManager = require('./managers/socket_manager');

module.exports = class UIManager {
    constructor(broker, options = {}) {
        this.broker = broker;
        this.options = {
            port: options.port || process.env.UI_PORT || 1026,
            host: options.host || process.env.UI_HOST || '0.0.0.0',
            refresh_interval: options.refresh_interval || process.env.UI_REFRESH_INTERVAL || 1000
        };

        this.socket_manager = new SocketManager();
        this.server = null;
        this.app = null;

        this.refresh_id = 0;
    }

    start() {
        return new Promise((resolve, reject) => {
            if (!this.app) {
                this.app = express();
                this.app.set('view engine', 'ejs');
                this.app.set('views', path.join(__dirname, './views'))

                this.server = http.createServer(this.app);
                this.io = new SocketIo.Server(this.server);

                this.setup_listeners();
            }

            this.server.listen(this.options.port, this.options.host, () => {
                resolve();
            });
        });
    }

    stop() {
        return new Promise((resolve, reject) => {
            this.app.close(() => {
                this.app = null;
                resolve();
            });
        });
    }

    setup_listeners() {
        this.app.get('/', (req, res) => {
            res.render('index');
        });

        this.refresh_id = setInterval(() => {
            this.io.sockets.emit('queue:stats', this.broker.queue_manager.get_stats());
            this.io.sockets.emit('messages:stats', this.broker.message_manager.metrics);
        }, this.options.refresh_interval);

        this.io.on('connection', (socket) => {
            this.socket_manager.add(socket);

            socket.on('get:queue', async () => {
                socket.emit('queue:list', await this.broker.queue_manager.get_queues());
            });

            socket.on('create:queue', async payload => {
                if (payload.name.length > 0) {
                    let created = this.broker.queue_manager.create_queue(payload.name);

                    if (created) {
                        this.io.sockets.emit('queue:list', await this.broker.queue_manager.get_queues());
                        this.broker.logger.info('Created queue: %s', payload.name);
                    } else {
                        this.io.sockets.emit('queue:error', 'Queue name already exists');
                        this.broker.logger.warn('Cannot create queue, "%s" already exists.', payload.name);
                    }
                }
            });

            socket.on('delete:queue', async id => {
                if (typeof id != 'undefined') {
                    let deleted = await this.broker.queue_manager.delete_queue_by_id(id);

                    if (deleted) {
                        this.io.sockets.emit('queue:list', await this.broker.queue_manager.get_queues());
                        this.broker.logger.info('Deleted queue: %s', deleted);
                    }
                }
            });

            socket.on('purge:queue', id => {
                if (typeof id != 'undefined') {
                    let purged = this.broker.queue_manager.purge_queue_by_id(id);

                    if (purged) {
                        this.broker.logger.info('Purged queue: %s', purged);
                        this.io.sockets.emit('queue:stats', this.broker.queue_manager.get_stats());
                    }
                }
            });

            socket.on('create:message', async payload => {
                if (typeof payload.priority == 'undefined')
                    return;
                if (typeof payload.text == 'undefined')
                    return;
                if (typeof payload.queue == 'undefined')
                    return;
                if (typeof payload.type == 'undefined')
                    return;

                switch (payload.type) {
                    case 'publish': {
                        if (typeof payload.multiplier != 'undefined') {
                            let max = parseInt(payload.multiplier);
                            let message = this.broker.message_manager.create_publish_packet(payload.queue, payload.priority, payload.text);

                            for (let i = 0; i < max; ++i) {
                                try {
                                    await this.broker.handle_publish(message, {
                                        publish: {
                                            queue: payload.queue,
                                            priority: payload.priority,
                                            payload: payload.text
                                        }
                                    });
                                } catch (error) {
                                    console.log(error);
                                }
                            }

                            this.io.sockets.emit('queue:stats', this.broker.queue_manager.get_stats());
                        }
                        break;
                    }
                    case 'produce': {
                        if (typeof payload.multiplier != 'undefined') {
                            let max = parseInt(payload.multiplier);
                            let message = this.broker.message_manager.create_produce_packet(payload.queue, payload.priority, payload.text);

                            for (let i = 0; i < max; ++i) {
                                try {
                                    await this.broker.handle_produce(message, {
                                        produce: {
                                            queue: payload.queue,
                                            priority: payload.priority,
                                            payload: payload.text
                                        }
                                    });
                                }
                                catch (error) {
                                    console.log(error);
                                }
                            }

                            this.io.sockets.emit('queue:stats', this.broker.queue_manager.get_stats());
                        }
                        break;
                    }
                }
            });

            socket.on('disconnect', () => {
                this.socket_manager.remove(socket);
            })
        });
    }
}