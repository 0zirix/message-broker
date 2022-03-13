const redis = require('redis');

module.exports = class StorageManager {
    constructor(options = {}) {
        this.options = {
            url: options.url || process.env.REDIS_URL || 'redis://localhost:6379',
        };

        this.reconnecting = false;
        this.connecting = false;
        this.ready = false;

        this.client = redis.createClient({
            url: this.options.url
        });

        this.setup_listeners();
    }

    async connect() {
        await this.client.connect();
    }

    async disconnect() {
        await this.client.disconnect();
    }

    async exec(method, ...args) {
        await this.client[method](...args);
    }

    setup_listeners() {
        this.client.on('error', error => this.handle_error(error).bind(this));
        this.client.on('connect ', () => this.handle_connect().bind(this));
        this.client.on('ready ', () => this.handle_ready().bind(this));
        this.client.on('end ', () => this.handle_end().bind(this));
        this.client.on('reconnecting ', () => this.handle_reconnecting().bind(this));
    }

    handle_error(error) {
        console.log(error);
    }

    handle_connect() {
        this.connecting = true;
    }

    handle_ready() {
        this.ready = true;
        this.reconnecting = false;
        this.connecting = false;
    }

    handle_end() {
        this.ready = false;
        this.reconnecting = false;
        this.connecting = false;
    }

    handle_reconnecting() {
        this.reconnecting = true;
    }
}