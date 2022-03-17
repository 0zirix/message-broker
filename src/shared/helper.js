const Helper = {
    generateUID() {
        return Math.random().toString(16).slice(2);
    },
    getRandomInt(min, max) {
        min = Math.ceil(min);
        max = Math.floor(max);

        return Math.floor(Math.random() * (max - min + 1)) + min;
    },
    size_of(object) {
        let objectList = [];
        let stack = [object];
        let bytes = 0;

        while (stack.length) {
            let value = stack.pop();

            if (typeof value === 'boolean')
                bytes += 4;
            else if (typeof value === 'string')
                bytes += value.length * 2;
            else if (typeof value === 'number')
                bytes += 8;
            else if (typeof value === 'object'
                && objectList.indexOf(value) === -1) {
                objectList.push(value);

                for (var i in value)
                    stack.push(value[i]);
            }
        }

        return bytes;
    },
    bytes_to_human(bytes) {
        if (bytes < 1024) return bytes + ' bytes';
        else if (bytes < 1048576) return (bytes / 1024).toFixed(3) + ' KiB';
        else if (bytes < 1073741824) return (bytes / 1048576).toFixed(3) + ' MiB';
        else return (bytes / 1073741824).toFixed(3) + ' GiB';
    },
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
};

module.exports = Helper;