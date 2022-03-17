const Helper = require('../../shared/helper');

module.exports = class UserManager {
    constructor(storage_manager) {
        this.storage_manager = storage_manager;
        this.users = [];

        this.user_storage_key = 'user_list';
    }
}