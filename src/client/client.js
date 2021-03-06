const net = require('net');
const EventEmitter = require('events');

const Logger = require('../shared/logger');
const Helper = require('../shared/helper');
const MessageManager = require('../shared/message_manager');

module.exports = class Client extends EventEmitter {
    constructor(options = {}) {
        super();
        this.options = {
            url: options.url || process.env.SERVER_URL || 'mtp://localhost:1025',
            logging: options.logging || process.env.LOGGING || true,
        };

        this.logger = new Logger('CLIENT');
        this.message_manager = new MessageManager();
        this.socket = null;
        this.connected = false;
        this.connecting = false;

        this.callbacks = {};
    }

    async connect() {
        await this.message_manager.load_protocol();
        const url = new URL(this.options.url);

        this.socket = net.connect({
            host: url.hostname,
            port: url.port
        });

        this.socket.on('data', async data => {
            try {
                let packet = await this.message_manager.receive(data);

                if (packet) {
                    switch (packet.payload) {
                        case 'publish': {
                            if (typeof this.callbacks[packet.publish.queue] != 'undefined') {
                                this.callbacks[packet.publish.queue]({
                                    queue: packet.publish.queue,
                                    payload: packet.publish.payload,
                                    priority: packet.publish.priority
                                });
                            }
                            break;
                        }
                        case 'subscribe': {
                            break;
                        }
                        case 'produce': {
                            break;
                        }
                        case 'consume': {
                            console.log('received consume packet', packet.consume.queue);

                            if (typeof this.callbacks[packet.consume.queue] != 'undefined') {
                                this.callbacks[packet.consume.queue]({
                                    queue: packet.consume.queue,
                                    payload: packet.consume.payload,
                                });
                            }
                            break;
                        }
                        case 'request': {
                            break;
                        }
                        case 'response': {
                            try {
                                const response = JSON.parse(packet.response.payload);

                                if (packet.response.type === MessageManager.types.AUTH_CHALLENGE 
                                && response.auth.status === 'LOGGED') {
                                    if (this.options.logging)
                                        this.logger.info('Identified');

                                    this.emit('identified');
                                } else {
                                    const callback_name = 'response_' + packet.response.type;

                                    if (typeof this.callbacks[callback_name] != 'undefined') {
                                        this.callbacks[callback_name](response);
                                        delete this.callbacks[callback_name];
                                    }
                                }
                            }
                            catch (error) {
                                console.log('Cannot parse response packet payload.');
                            }
                            break;
                        }
                        case 'acknowledge': {
                            break;
                        }
                    }
                }
            }
            catch (e) {
                console.log('Unable to decode packet')
            }
        });

        this.socket.on('error', error => {
            if (this.options.logging)
                this.logger.error(error);

            this.emit('error', error);
        });

        this.socket.on('ready', async () => {
            if (this.options.logging)
                this.logger.info('Connected');

            this.connected = true;
            this.connecting = false;

            if (url.username.length > 0 && url.password.length > 0) {
                if (this.options.logging)
                    this.logger.info('Identifying...')

                await this.request(MessageManager.types.AUTH_CHALLENGE, {
                    username: url.username,
                    password: url.password
                });
            }
            else
                this.emit('ready');
        });

        this.socket.on('connect', () => {
            if (this.options.logging)
                this.logger.info('Connecting...')

            this.connecting = true;

            this.emit('connect');
        });

        this.socket.on('close', error => {
            this.socket.destroy();
            this.socket = null;
            this.connected = false;
            this.connecting = false;

            this.emit('disconnect');

            if (this.options.logging)
                this.logger.warn('Connection closed');

            if (error && this.options.logging)
                this.logger.error(error);
        });
    }

    disconnect() {
        this.socket.destroy();
        this.emit('disconnect');

        if (this.options.logging)
            this.logger.info('Disconnected')
    }

    send(payload) {
        return new Promise(async (resolve, reject) => {
            if (!this.connected)
                return;

            this.socket.write(payload);
            await Helper.sleep(3);
            resolve();
        })
    }

    async publish(queue, payload, priority = 1) {
        if (!this.connected)
            return;

        try {
            await this.send(this.message_manager.create_publish_packet(
                queue,
                priority,
                payload
            ));

            if (this.options.logging)
                this.logger.info('Published message: %s with priority %d', payload, priority);
        }
        catch (e) {
            console.log(e);
        }
    }

    async subscribe(queue, callback) {
        if (!this.connected)
            return;

        try {
            this.callbacks[queue] = callback;
            await this.send(this.message_manager.create_subscribe_packet(queue));

            if (this.options.logging)
                this.logger.info('Subscribed to queue: %s', queue);
        }
        catch (e) {
            console.log(e);
        }
    }

    async produce(queue, payload, priority = 1) {
        if (!this.connected)
            return;

        try {
            await this.send(this.message_manager.create_produce_packet(
                queue,
                priority,
                payload
            ));
        }
        catch (e) {
            console.log(e);
        }
    }

    async consume(queue, callback) {
        if (!this.connected)
            return;

        try {
            this.callbacks[queue] = callback;
            await this.send(this.message_manager.create_consume_packet(queue, ''));
        }
        catch (e) {
            console.log(e);
        }
    }

    async request(type, payload, callback) {
        if (!this.connected)
            return;

        try {
            this.callbacks['response_' + type] = callback;

            await this.send(this.message_manager.create_request_packet(
                type,
                JSON.stringify(payload)
            ));
        }
        catch (e) {
            console.log(e);
        }
    }

    async create_queue(name, capacity = 100000, callback) {
        return await this.request(MessageManager.types.CREATE_QUEUE, { name, capacity }, callback);
    }

    async count_queue(name, callback) {
        return await this.request(MessageManager.types.COUNT_QUEUE, { name }, callback);
    }

    async purge_queue(name, callback) {
        return await this.request(MessageManager.types.PURGE_QUEUE, { name }, callback);
    }

    async delete_queue(name, callback) {
        return await this.request(MessageManager.types.DELETE_QUEUE, { name }, callback);
    }
}