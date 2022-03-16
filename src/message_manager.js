const path = require('path');
const protobuf = require("protobufjs");

module.exports = class MessageManager {
    static types = {
        CREATE_QUEUE: 0,
        PURGE_QUEUE: 1,
        DELETE_QUEUE: 2
    };

    constructor(logger, queue_manager, options = {}) {
        this.options = {
            logging: options.logging || process.env.LOGGING || true
        };

        this.logger = logger;
        this.queue_manager = queue_manager;
        this.protocol = null;
    }

    load_protocol() {
        return new Promise((resolve, reject) => {
            const proto_path = path.join(__dirname, './protos/messages.proto');

            protobuf.load(proto_path, (error, root) => {
                if (error)
                    reject(error);
                else {
                    this.protocol = root;
                    resolve();
                }
            });
        });
    }

    async receive(chunk) {
        return new Promise((resolve, reject) => {
            try {
                const PacketMessage = this.protocol.lookupType('Packet');
                resolve(PacketMessage.decode(chunk, chunk.length));
            }
            catch (e) {
                reject(e);
                console.log(e)
            }
        });
    }

    create_packet(data) {
        if (this.protocol) {
            let PacketMessage = this.protocol.lookupType('Packet');
            return PacketMessage.encode(PacketMessage.create(data)).finish();
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