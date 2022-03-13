const net = require('net');

const Logger = require('./logger');
const Helper = require('./helper');
const MessageManager = require('./message_manager');
const QueueManager = require('./queue_manager');
const SocketManager = require('./socket_manager')
const StorageManager = require('./storage_manager');
const UIManager = require('./ui_manager');

module.exports = class Server {
    constructor(options = {}) {
        this.options = {
            logging: options.logging || process.env.LOGGING || true,
            port: options.port || process.env.PORT || 1025,
            host: options.host || process.env.HOST || '0.0.0.0',
            exclusive: false,
            ui_enabled: options.ui_enabled || process.env.UI_ENABLED || true,
            publish_interval: options.publish_interval || process.env.PUBLISH_INTERVAL || 3
        };

        this.logger = new Logger('SERVER');
        this.storage_manager = new StorageManager();
        this.queue_manager = new QueueManager(this.storage_manager);
        this.socket_manager = new SocketManager();

        this.message_manager = new MessageManager(this.logger, this.queue_manager, {
            logging: this.options.logging
        });

        if (this.options.ui_enabled)
            this.ui_manager = new UIManager(this);

        this.instance = null;
        this.subscribers = {};
    }

    async start() {
        return new Promise(async (resolve, reject) => {
            if (!this.instance) {
                this.instance = net.createServer();
                this.setup_listeners();

                await this.message_manager.load_protocol();
                await this.storage_manager.connect();
                await this.queue_manager.load_queues();

                if (this.options.ui_enabled)
                    await this.ui_manager.start();
            }

            this.instance.listen(this.options, () => {
                if (this.options.logging)
                    this.logger.info('Server started');

                resolve(this);
            });
        });
    }

    async stop() {
        return new Promise(async (resolve, reject) => {
            await this.storage_manager.disconnect();

            if (this.options.ui_enabled)
                await this.ui_manager.stop();

            this.instance.close(() => {
                if (this.options.logging)
                    this.logger.info('Server stopped');

                resolve(this);
            });
        });
    }

    setup_listeners() {
        this.instance.on('connection', this.handle_connection.bind(this));
        this.instance.on('error', this.handle_error.bind(this));
    }

    handle_connection(socket) {
        if (this.options.logging)
            this.logger.info('Client connected');

        socket.id = Helper.generateUID();
        this.socket_manager.add(socket);

        socket.on('data', async data => {
            let decoded = await this.message_manager.decode(data);

            let accepted = [
                'publish',
                'subscribe',
                'produce',
                'consume'
            ];

            if (accepted.indexOf(decoded.payload) >= 0) {
                try {
                    await this['handle_' + decoded.payload](decoded, socket);
                }
                catch (error) {
                    console.log(error);
                }
            }
        });

        socket.on('error', error => {
            if (this.options.logging)
                this.logger.error(error);

            this.handle_unsubscribe(socket.id);
            this.socket_manager.remove(socket);
        });

        socket.on('close', () => {
            this.handle_unsubscribe(socket.id);
            this.socket_manager.remove(socket);

            if (this.options.logging)
                this.logger.info('Client disconnected');
        });
    }

    handle_error(error) {
        if (this.options.logging)
            this.logger.error(error);
    }

    handle_publish(decoded, socket) {
        return new Promise(async (resolve, reject) => {
            let queue = decoded.publish.queue;

            if (Object.keys(this.subscribers).length == 0)
                return reject('No subscribers');

            if (typeof this.subscribers[queue] == 'undefined')
                return reject('No subscriber for queue ' + queue);

            let sockets = this.subscribers[queue];

            let packet = this.message_manager.create_publish_packet(
                queue,
                decoded.publish.priority,
                decoded.publish.payload
            );

            for (let i = 0; i < sockets.length; ++i) {
                let client = this.socket_manager.get_socket_by_id(sockets[i]);

                if (client) {
                    client.write(packet);
                    await Helper.sleep(this.options.publish_interval);
                }
            }

            resolve();
        })
    }

    async handle_subscribe(decoded, socket) {
        let queue = decoded.subscribe.queue;

        if (typeof queue != 'undefined') {
            if (typeof this.subscribers[queue] == 'undefined') {
                this.subscribers[queue] = [socket.id];
            } else {
                let index = this.subscribers[queue].indexOf(socket.id);

                if (index == -1)
                    this.subscribers[queue].push(socket.id);
            }
        }
    }

    handle_unsubscribe(socket_id) {
        for (let queue in this.subscribers) {
            let index = this.subscribers[queue].indexOf(socket_id);

            if (index >= 0) {
                this.subscribers[queue].splice(index, 1);

                if (this.subscribers[queue].length === 0)
                    delete this.subscribers[queue];
            }
        }
    }

    handle_produce(decoded, socket) {
        if (this.queue_manager.queue_exists(decoded.produce.queue)) {
            this.queue_manager.add_message_to_queue(
                decoded.produce.queue,
                decoded.produce.priority,
                decoded.produce.payload
            );
        }
    }

    handle_consume(decoded, socket) {
        if (this.queue_manager.queue_exists(decoded.consume.queue)) {
            let message = this.queue_manager.pop_message_from_queue(decoded.consume.queue);

            if (message) {
                let packet = this.message_manager.create_consume_packet(decoded.consume.queue, message.payload);
                socket.write(packet);
            }
        }
    }
}