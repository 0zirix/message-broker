module.exports = class SocketManager {
    constructor() {
        this.sockets = [];
    }

    size() {
        return this.sockets.length;
    }

    add(socket) {
        this.sockets.push(socket);
    }

    remove(socket) {
        const index = this.sockets.indexOf(socket);

        if (index >= 0)
            this.sockets.splice(index, 1);
    }

    get_socket_by_id(id) {
        return this.sockets.find(socket => socket.id === id);
    }
}