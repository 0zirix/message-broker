const Helper = require('../../shared/helper');

module.exports = class UserController {
    constructor(logger, user_manager, message_manager) {
        this.logger = logger;
        this.user_manager = user_manager;
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

    async auth_challenge(decoded, socket) {
        if (typeof decoded.request.payload != 'undefined') {
            try {
                const params = JSON.parse(decoded.request.payload);

                if (typeof params.username == 'undefined')
                    return this.send_error_packet(socket, decoded.request.type, 400, `You must provide a username.`);

                if (typeof params.password == 'undefined')
                    return this.send_error_packet(socket, decoded.request.type, 400, `You must provide a password.`);

                const packet = this.message_manager.create_response_packet(decoded.request.type, 200, JSON.stringify({
                    auth: {
                        status: 'LOGGED'
                    }
                }));

                socket.write(packet);
                await Helper.sleep(this.options.send_interval);
                this.logger.info('User authentified: %s', params.username);
            }
            catch (error) {
                this.send_error_packet(socket, decoded.request.type, 400, `Internal server error, cannot auth user.`);
                console.log('Request packet error: cannot auth user', error);
            }
        }
    }
}