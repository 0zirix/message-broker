const Helper = require('../../shared/helper');

module.exports = class QueueController {
    constructor(logger, queue_manager, message_manager) {
        this.logger = logger;
        this.queue_manager = queue_manager;
        this.message_manager = message_manager;

        this.options = {
            send_interval: 3
        };
    }

    send_error_packet(socket, type, status, message) {
        let payload = JSON.stringify({
            error: { message }
        });

        socket.write(this.message_manager.create_response_packet(type, status, payload));
    };

    async create_queue(decoded, socket) {
        if (typeof decoded.request.payload != 'undefined') {
            try {
                const params = JSON.parse(decoded.request.payload);
                let capacity = this.options.queue_max_capacity;

                if (typeof params.capacity != 'undefined')
                    if (!isNaN(parseInt(params.capacity)) && capacity <= this.options.queue_max_capacity)
                        capacity = params.capacity;

                if (typeof params.name == 'undefined')
                    return this.send_error_packet(socket, decoded.request.type, 400, `You must provide a queue name.`);

                if (this.queue_manager.queue_exists(params.name))
                    return this.send_error_packet(socket, decoded.request.type, 400, `A queue with name '${params.name}' already exists.`);

                const queue = await this.queue_manager.create_queue(params.name, capacity);
                const packet = this.message_manager.create_response_packet(decoded.request.type, 200, JSON.stringify({
                    queue: {
                        id: queue.id,
                        name: queue.name,
                        capacity: queue.capacity
                    }
                }));

                socket.write(packet);
                await Helper.sleep(this.options.send_interval);
                this.logger.info('Created queue: %s with id %s', queue.name, queue.id);
            }
            catch (error) {
                this.send_error_packet(socket, decoded.request.type, 400, `Internal server error, cannot create queue.`);
                console.log('Request packet error: cannot create queue', error);
            }
        }
    }

    async count_queue(decoded, socket) {
        if (typeof decoded.request.payload != 'undefined') {
            try {
                const params = JSON.parse(decoded.request.payload);

                if (typeof params.name == 'undefined')
                    return this.send_error_packet(socket, decoded.request.type, 400, `You must provide a queue name.`);

                if (!this.queue_manager.queue_exists(params.name))
                    return this.send_error_packet(socket, decoded.request.type, 404, `Cannot find a queue with name '${params.name}'.`);

                const count = await this.queue_manager.count_queue(params.name);
                const packet = this.message_manager.create_response_packet(decoded.request.type, 200, JSON.stringify({
                    queue: { count }
                }));

                socket.write(packet);
                await Helper.sleep(this.options.send_interval);
            }
            catch (error) {
                this.send_error_packet(socket, decoded.request.type, 400, `Internal server error, cannot count queue.`);
                console.log('Request packet error: cannot count queue', error);
            }
        }
    }

    async purge_queue(decoded, socket) {
        if (typeof decoded.request.payload != 'undefined') {
            try {
                const params = JSON.parse(decoded.request.payload);

                if (typeof params.name == 'undefined')
                    return this.send_error_packet(socket, decoded.request.type, 400, `You must provide a queue name.`);

                if (!this.queue_manager.queue_exists(params.name))
                    return this.send_error_packet(socket, decoded.request.type, 404, `Cannot find a queue with name '${params.name}'.`);

                const count = await this.queue_manager.purge_queue_by_name(params.name);
                const packet = this.message_manager.create_response_packet(decoded.request.type, 200, JSON.stringify({
                    queue: {
                        name: params.name,
                        purged: count
                    }
                }));

                socket.write(packet);
                await Helper.sleep(this.options.send_interval);
                this.logger.info('Purged %d messages in queue %s', count, params.name);
            }
            catch (error) {
                this.send_error_packet(socket, decoded.request.type, 400, `Internal server error, cannot purge queue.`);
                console.log('Request packet error: cannot purge queue', error);
            }
        }
    }

    async delete_queue(decoded) {
        if (typeof decoded.request.payload != 'undefined') {
            try {
                const params = JSON.parse(decoded.request.payload);

                if (typeof params.name == 'undefined')
                    return this.send_error_packet(socket, decoded.request.type, 400, `You must provide a queue name.`);

                if (!this.queue_manager.queue_exists(params.name))
                    return this.send_error_packet(socket, decoded.request.type, 404, `Cannot find a queue with name '${params.name}'.`);

                const deleted = await this.queue_manager.delete_queue_by_name(params.name);
                const packet = this.message_manager.create_response_packet(decoded.request.type, 200, JSON.stringify({
                    queue: {
                        name: params.name,
                        deleted: deleted
                    }
                }));

                socket.write(packet);
                await Helper.sleep(this.options.send_interval);
                this.logger.info('Delete queue %s', params.name);
            }
            catch (error) {
                this.send_error_packet(socket, decoded.request.type, 400, `Internal server error, cannot delete queue.`);
                console.log('Request packet error: cannot delete queue', error);
            }
        }
    }
}