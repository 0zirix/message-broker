const Queue = require('./queue');
const Message = require('./message');
const Helper = require('./helper');

module.exports = class QueueManager {
    constructor(storage_manager) {
        this.storage_manager = storage_manager;
        this.queues = {};
        this.messages = [];

        this.queue_storage_key = 'queue_list';
    }

    size() {
        return Object.keys(this.queues).length;
    }

    async load_queues() {
        const queue_list = await this.storage_manager.client.sendCommand([
            'LRANGE', this.queue_storage_key, 0, -1
        ]);

        for (let q of queue_list) {
            let data = JSON.parse(q);

            if (typeof this.queues[data.name] == 'undefined') {
                this.queues[data.name] = new Queue(
                    data.name,
                    data.capacity,
                    data.id
                );
            }
        }
    }

    async save_queue(queue) {
        await this.storage_manager.client.sendCommand([
            'RPUSH', this.queue_storage_key, JSON.stringify({
                id: queue.id,
                name: queue.name,
                capacity: queue.capacity,
                size: 0,
            })
        ]);
    }

    async delete_queue(queue) {
        const index = await this.storage_manager.client.sendCommand([
            'LPOS', this.queue_storage_key, queue
        ]);

        if (index >= 0) {
            return await this.storage_manager.client.sendCommand([
                'LREM', this.queue_storage_key, 0, queue
            ]);
        }

        return null;
    }

    create_queue(name, capacity = 100000, id = null) {
        return new Promise(async (resolve, reject) => {
            if (typeof this.queues[name] == 'undefined') {
                let queue = new Queue(name, capacity, id);
                this.queues[name] = queue;
                await this.save_queue(queue);

                return resolve(queue);
            }
            else {
                return reject(false);
            }
        });
    }

    add_message_to_queue(queue, priority, payload) {
        if (typeof this.queues[queue] != 'undefined') {
            let message = new Message(payload, priority);
            let added = this.queues[queue].push(message.id, priority);

            if (added) {
                this.messages.push(message);
                this.queues[queue].memory += Helper.size_of(message);
                return true;
            }
        }

        return null;
    }

    pop_message_from_queue(queue) {
        if (typeof this.queues[queue] != 'undefined') {
            let id = this.queues[queue].pop();
            let index = this.messages.findIndex(m => m.id === id);

            if (index >= 0) {
                let message = this.messages[index];
                this.queues[queue].memory -= Helper.size_of(message);
                this.messages.splice(index, 1);

                return message;
            }
        }

        return null;
    }

    peek_message_from_queue(queue) {
        if (typeof this.queues[queue] != 'undefined') {
            let id = this.queues[queue].peek();
            let index = this.messages.findIndex(m => m.id === id);

            if (index >= 0) {
                return this.messages[index];
            }
        }

        return null;
    }

    async delete_queue_by_id(id) {
        for (let q in this.queues) {
            if (this.queues[q].id === id) {
                let name = this.queues[q].name;

                await this.delete_queue(JSON.stringify({
                    id: this.queues[q].id,
                    name: this.queues[q].name,
                    capacity: this.queues[q].capacity,
                    size: 0
                }));

                delete this.queues[q];

                return name;
            }
        }

        return null;
    }

    purge_queue_by_id(id) {
        for (let q in this.queues) {
            if (this.queues[q].id === id) {
                let name = this.queues[q].name;
                this.queues[q].clear();
                this.queues[q].memory = 0;

                return name;
            }
        }

        return null;
    }

    queue_exists(queue) {
        return typeof this.queues[queue] != 'undefined';
    }

    get_queues() {
        let queues = [];

        for (let q in this.queues) {
            let queue = this.queues[q];

            queues.push({
                id: queue.id,
                name: queue.name,
                size: queue.size(),
                memory: queue.memory,
                capacity: queue.capacity
            });
        }

        return queues;
    }

    get_stats() {
        let stats = [];

        for (let name in this.queues) {
            let queue = this.queues[name];

            stats.push({
                id: queue.id,
                size: queue.size(),
                memory: queue.memory,
                capacity: queue.capacity
            });
        }

        return stats;
    }
}