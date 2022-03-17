const { MinQueue } = require("heapify");
const Helper = require('../shared/helper');

module.exports = class Queue {
    constructor(name, capacity = 100000, id = null) {
        this.id = id || Helper.generateUID();
        this.name = name;
        this.capacity = capacity;
        this.memory = 0;;
        this.q = new MinQueue(capacity);
    }

    size() {
        return this.q.size;
    }

    clear() {
        this.q = new MinQueue(this.capacity);
    }

    push(id, priority) {
        if (this.q.size < this.capacity) {
            this.q.push(id, priority);
            return true;
        }

        return false;
    }

    peek() {
        return this.q.peek();
    }

    pop() {
        return this.q.pop();
    }
};