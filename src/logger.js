const winston = require('winston');

module.exports = class Logger {
    constructor(label) {
        this.logger = winston.createLogger({
            format: winston.format.combine(
                winston.format.label({
                    label: '[' + label + ']'
                }),
                winston.format.timestamp({
                    format: "YYYY-MM-DD HH:mm:ss"
                }),
                winston.format(info => {
                    info.level = info.level.toUpperCase()
                    return info;
                })(),
                winston.format.splat(),
                winston.format.colorize(),
                winston.format.printf(
                    info => [info.label, info.timestamp, info.level, info.message].join(' ')
                ),
            ),
            transports: [
                new winston.transports.Console()
            ]
        });
    }

    log(...args) { this.logger.debug(...args); }
    info(...args) { this.logger.info(...args); }
    warn(...args) { this.logger.warn(...args); }
    error(...args) { this.logger.error(...args); }
}