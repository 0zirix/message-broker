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
            publish_interval: options.publish_interval || process.env.PUBLISH_INTERVAL || 3,
            queue_max_capacity: options.queue_max_capacity || process.env.QUEUE_MAX_CAPACITY || 1000000,
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
        if (!this.ready)
            return false;

        if (this.options.logging)
            this.logger.info('Client connected');

        socket.id = Helper.generateUID();
        this.socket_manager.add(socket);

        socket.on('data', async chunk => {
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
                        console.log(error);
                    }
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
                let packet = this.message_manager.create_consume_packet(decoded.consume.queue, message.payload);
                socket.write(packet);
            }
        }
    }

    async handle_request(chunk, decoded, socket) {
        switch (decoded.request.type) {
            case MessageManager.types.CREATE_QUEUE: {
                if (typeof decoded.request.payload != 'undefined') {
                    try {
                        const params = JSON.parse(decoded.request.payload);
                        let capacity = this.options.queue_max_capacity;

                        if (typeof params.capacity != 'undefined') {
                            if (!isNaN(parseInt(params.capacity)) && capacity <= this.options.queue_max_capacity) {
                                capacity = params.capacity;
                            }
                        }

                        if (typeof params.name != 'undefined') {
                            if (!this.queue_manager.queue_exists(params.name)) {
                                const queue = await this.queue_manager.create_queue(params.name, capacity);
                                this.logger.info('Created queue: %s with id %s', queue.name, queue.id);
                                // TODO: send client response packet
                            }
                        }
                    }
                    catch (error) {
                        console.log('Request packet error: cannot create queue', error);
                    }
                }
                break;
            }
            case MessageManager.types.PURGE_QUEUE: {
                if (typeof decoded.request.payload != 'undefined') {
                    try {
                        const params = JSON.parse(decoded.request.payload);

                        if (typeof params.name != 'undefined') {
                            if (this.queue_manager.queue_exists(params.name)) {
                                const count = await this.queue_manager.purge_queue_by_name(params.name);
                                this.logger.info('Purged %d in queue %s', count, params.name);
                                // TODO: send client response packet
                            }
                        }
                    }
                    catch (error) {
                        console.log('Request packet error: cannot purge queue', error);
                    }
                }
                break;
            }
            case MessageManager.types.DELETE_QUEUE: {
                console.log('DELLLLLLLLLLL');
                break;
            }
        }
    }

    handle_acknowledge(chunk, decoded, socket) {

    }
}