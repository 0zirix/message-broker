const net = require('net');

const Logger = require('../shared/logger');
const Helper = require('../shared/helper');
const MessageManager = require('../shared/message_manager');
const QueueManager = require('./managers/queue_manager');
const SocketManager = require('./managers/socket_manager')
const StorageManager = require('./managers/storage_manager');
const UserManager = require('./managers/user_manager');
const UIManager = require('./ui_manager');

const QueueController = require('./controllers/queue_controller');
const UserController = require('./controllers/user_controller');

module.exports = class Server {
    constructor(options = {}) {
        this.options = {
            logging: options.logging || process.env.LOGGING || true,
            port: options.port || process.env.PORT || 1025,
            host: options.host || process.env.HOST || '0.0.0.0',
            exclusive: false,
            ui_enabled: options.ui_enabled || process.env.UI_ENABLED || true,
            publish_interval: options.publish_interval || process.env.PUBLISH_INTERVAL || 3,
            queue_max_capacity: options.queue_max_capacity || process.env.QUEUE_MAX_CAPACITY || 1000000,
        };

        this.logger = new Logger('SERVER');
        this.socket_manager = new SocketManager();
        this.storage_manager = new StorageManager();

        this.message_manager = new MessageManager(this.logger, this.queue_manager, {
            logging: this.options.logging
        });

        this.queue_manager = new QueueManager(this.storage_manager);
        this.user_manager = new UserManager(this.storage_manager);

        this.queue_controller = new QueueController(this.logger, this.queue_manager, this.message_manager);
        this.user_controller = new UserController(this.logger, this.user_manager, this.message_manager);


        if (this.options.ui_enabled)
            this.ui_manager = new UIManager(this);

        this.instance = null;
        this.ready = false;
        this.subscribers = {};
    }

    async start() {
        return new Promise(async (resolve, reject) => {
            if (!this.instance) {
                this.instance = net.createServer();

                await this.message_manager.load_protocol();
                await this.storage_manager.connect();
                await this.queue_manager.load_queues();

                if (this.options.ui_enabled)
                    await this.ui_manager.start();

                this.setup_listeners();
            }

            this.instance.listen(this.options, () => {
                if (this.options.logging)
                    this.logger.info('Server started');

                this.ready = true;
                resolve(this);
            });
        });
    }

    async stop() {
        return new Promise(async (resolve, reject) => {
            await this.storage_manager.disconnect();
            this.ready = false;

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
        this.instance.on('listening', this.handle_listening.bind(this));
        this.instance.on('error', this.handle_error.bind(this));
    }

    handle_listening() {
        this.logger.info('Listening for connections...');
    }

    handle_connection(socket) {
        if (!this.ready) {
            socket.destroy();
            return false;
        }

        if (this.options.logging)
            this.logger.info('Client connected %s', socket.remoteAddress);

        socket.id = Helper.generateUID();
        this.socket_manager.add(socket);

        socket.on('data', async chunk => {
            try {
                let decoded = await this.message_manager.receive(chunk);

                if (decoded) {
                    let accepted = [
                        'publish',
                        'subscribe',
                        'produce',
                        'consume',
                        'request',
                        'acknowledge'
                    ];

                    if (accepted.indexOf(decoded.payload) >= 0) {
                        try {
                            await this['handle_' + decoded.payload](chunk, decoded, socket);
                        }
                        catch (error) {
                            if (this.options.logging)
                                console.error(error);
                        }
                    }
                }
            }
            catch (error) {
                if (this.options.logging)
                    console.error(error);
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

    async handle_publish(chunk, decoded, socket) {
        let queue = decoded.publish.queue;

        if (Object.keys(this.subscribers).length == 0)
            return;

        if (typeof this.subscribers[queue] == 'undefined')
            return;

        let sockets = this.subscribers[queue];
        this.queue_manager.metrics[queue].messages_per_sec_in++;

        for (let i = 0; i < sockets.length; ++i) {
            let client = this.socket_manager.get_socket_by_id(sockets[i]);

            if (client) {
                client.write(chunk);
                this.queue_manager.metrics[queue].messages_per_sec_out++;
                await Helper.sleep(this.options.publish_interval);
            }
        }
    }

    async handle_subscribe(chunk, decoded, socket) {
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

    handle_produce(chunk, decoded, socket) {
        if (this.queue_manager.queue_exists(decoded.produce.queue)) {
            this.queue_manager.push_message_to_queue(
                decoded.produce.queue,
                decoded.produce.priority,
                decoded.produce.payload
            );
        }
    }

    handle_consume(chunk, decoded, socket) {
        if (this.queue_manager.queue_exists(decoded.consume.queue)) {
            let message = this.queue_manager.pop_message_from_queue(decoded.consume.queue);

            if (message) {
                socket.write(this.message_manager.create_consume_packet(
                    decoded.consume.queue,
                    message.payload
                ));
            }
        }
    }

    async handle_request(chunk, decoded, socket) {

        switch (decoded.request.type) {
            case MessageManager.types.AUTH_CHALLENGE: {
                await this.user_controller.auth_challenge(decoded, socket);
                break;
            }
            case MessageManager.types.CREATE_QUEUE: {
                await this.queue_controller.create_queue(decoded, socket);
                break;
            }
            case MessageManager.types.COUNT_QUEUE: {
                await this.queue_controller.count_queue(decoded, socket);
                break;
            }
            case MessageManager.types.PURGE_QUEUE: {
                await this.queue_controller.purge_queue(decoded, socket);
                break;
            }
            case MessageManager.types.DELETE_QUEUE: {
                await this.queue_controller.delete_queue(decoded, socket);
                break;
            }
        }
    }

    handle_acknowledge(chunk, decoded, socket) {

    }
}