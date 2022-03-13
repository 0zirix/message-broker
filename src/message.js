module.exports = class Message {
    static index = 0;

    constructor(payload, priority) {
        this.id = Message.index++;
        this.payload = payload;
        this.priority = priority;
    }
}