const path = require('path');
const protobuf = require("protobufjs");

module.exports = class MessageManager {
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

    decode(buffer) {
        return new Promise((resolve, reject) => {
            try {
                const PacketMessage = this.protocol.lookupType('Packet');
                const decoded = PacketMessage.decode(buffer);
                resolve(decoded);
            }
            catch (e) {
                reject(e);
            }
        });
    }

    create_publish_packet(queue, priority, payload) {
        if (this.protocol) {
            let PacketMessage = this.protocol.lookupType('Packet');

            let message = PacketMessage.create({
                publish: {
                    queue,
                    priority,
                    payload,
                }
            });

            return PacketMessage.encode(message).finish();
        }
    }

    create_subscribe_packet(queue) {
        if (this.protocol) {
            let PacketMessage = this.protocol.lookupType('Packet');

            let message = PacketMessage.create({
                subscribe: {
                    queue
                }
            });

            return PacketMessage.encode(message).finish();
        }
    }

    create_produce_packet(queue, priority, payload) {
        if (this.protocol) {
            let PacketMessage = this.protocol.lookupType('Packet');

            let message = PacketMessage.create({
                produce: {
                    queue,
                    priority,
                    payload,
                }
            });

            return PacketMessage.encode(message).finish();
        }
    }

    create_consume_packet(queue, payload) {
        if (this.protocol) {
            let PacketMessage = this.protocol.lookupType('Packet');

            let message = PacketMessage.create({
                consume: {
                    queue,
                    payload
                }
            });

            return PacketMessage.encode(message).finish();
        }
    }

    async dispatch(queue, priority, message) {
        try {
            await this.queue_manager.add_message_to_queue(queue, priority, message);
        }
        catch (e) {
            console.log(e);
        }
    }
}