const path = require('path');
const protobuf = require("protobufjs");

module.exports = class MessageManager {
    static types = {
        AUTH_CHALLENGE: 0,
        CREATE_QUEUE: 1,
        COUNT_QUEUE: 2,
        PURGE_QUEUE: 3,
        DELETE_QUEUE: 4
    };

    constructor(logger, queue_manager, options = {}) {
        this.options = {
            logging: options.logging || process.env.LOGGING || true
        };

        this.metrics = {
            invalid_packets: 0,
            total_received_bytes: 0,
        };

        this.logger = logger;
        this.queue_manager = queue_manager;
        this.protocol = null;
        this.PacketMessage = null;
    }

    load_protocol() {
        return new Promise((resolve, reject) => {
            const proto_path = path.join(__dirname, './protos/messages.proto');

            protobuf.load(proto_path, (error, root) => {
                if (error)
                    reject(error);
                else {
                    this.protocol = root;
                    this.PacketMessage = this.protocol.lookupType('Packet');
                    resolve();
                }
            });
        });
    }

    async receive(chunk) {
        return new Promise((resolve, reject) => {
            try {
                const error = this.PacketMessage.verify(chunk);

                if (error)
                    this.metrics.invalid_packets++;
                else {
                    try {
                        this.metrics.total_received_bytes += chunk.length;
                        const data = this.PacketMessage.decode(chunk, chunk.length);
                        resolve(data);
                    }
                    catch (err) {
                        this.metrics.invalid_packets++;
                    }
                }
            }
            catch (e) {
                reject(e);
                console.log(e)
            }
        });
    }

    create_packet(data) {
        if (this.protocol) {
            return this.PacketMessage.encode(this.PacketMessage.create(data)).finish();
        }
    }

    create_publish_packet(queue, priority, payload) {
        return this.create_packet({
            publish: {
                queue,
                priority,
                payload,
            }
        });
    }

    create_subscribe_packet(queue) {
        return this.create_packet({
            subscribe: {
                queue
            }
        });
    }

    create_produce_packet(queue, priority, payload) {
        return this.create_packet({
            produce: {
                queue,
                priority,
                payload,
            }
        });
    }

    create_consume_packet(queue, payload) {
        return this.create_packet({
            consume: {
                queue,
                payload,
            }
        });
    }

    create_request_packet(type, payload) {
        return this.create_packet({
            request: {
                type,
                payload
            }
        });
    }

    create_response_packet(type, status, payload) {
        return this.create_packet({
            response: {
                type,
                status,
                payload
            }
        });
    }

    create_acknowledge_packet(type, id) {
        return this.create_packet({
            acknowledge: {
                type,
                id
            }
        });
    }
}