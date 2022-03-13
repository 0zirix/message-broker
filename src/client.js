const net = require('net');

const Logger = require('./logger');
const MessageManager = require('./message_manager');

module.exports = class Client {
    constructor(options = {}) {
        this.options = {
            logging: options.logging || process.env.LOGGING || true,
            port: options.port || process.env.PORT || 1025,
            host: options.host || process.env.HOST || '127.0.0.1'
        };

        this.logger = new Logger('CLIENT');
        this.message_manager = new MessageManager();
        this.socket = null;
        this.connected = false;

        this.callbacks = {};
    }

    connect() {
        return new Promise(async (resolve, reject) => {
            await this.message_manager.load_protocol();

            this.socket = net.connect(this.options);

            this.socket.on('data', async data => {
                try {
                    let packet = await this.message_manager.decode(data);

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
                            console.log(packet.subscribe.queue)
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
                    }
                }
                catch (e) {
                    console.log('Unable to decode packet')
                }
            });

            this.socket.on('error', error => {
                if (this.options.logging)
                    this.logger.error(error);

                reject(error);
            });

            this.socket.on('connect', () => {
                if (this.options.logging)
                    this.logger.info('Connected')

                this.connected = true;

                resolve(this);

            });

            this.socket.on('close', error => {
                this.socket.destroy();
                this.socket = null;
                this.connected = false;

                if (error && this.options.logging)
                    this.logger.error(error);
            });
        });
    }

    disconnect() {
        return new Promise((resolve, reject) => {
            this.socket.destroy();

            if (this.options.logging)
                this.logger.info('Disconnected')

            resolve();
        });
    }

    send(payload) {
        return new Promise((resolve, reject) => {
            if (!this.connected)
                return;

            this.socket.write(payload, error => {
                if (error) reject(error);
                else resolve()
            })
        })
    }

    async publish(queue, payload, priority = 1) {
        if (!this.connected)
            return;

        let packet = this.message_manager.create_publish_packet(queue, priority, payload);

        try {
            await this.send(packet);

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

        this.callbacks[queue] = callback;
        let packet = this.message_manager.create_subscribe_packet(queue);

        try {
            await this.send(packet);

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

        let packet = this.message_manager.create_produce_packet(queue, priority, payload);

        try {
            await this.send(packet);

            if (this.options.logging)
                this.logger.info('Produced message: %s with priority %d', payload, priority);
        }
        catch (e) {
            console.log(e);
        }
    }

    async consume(queue, callback) {
        if (!this.connected)
            return;

        this.callbacks[queue] = callback;
        let packet = this.message_manager.create_consume_packet(queue, '');

        try {
            await this.send(packet);
        }
        catch (e) {
            console.log(e);
        }
    }
}