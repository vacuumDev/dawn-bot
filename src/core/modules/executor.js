import config from "../../utils/config.js";
import {Bot} from "../bot/base.js";
import fileOperations from "../../utils/file_utils.js";

export default class ModuleExecutor {
    /**
     * @param {object} account - экземпляр Account модели с полями email, password и т.д.
     */
    constructor(account) {
        this.account = account;
        this.bot = new Bot(account);
    }

    /** Обработка регистрации аккаунта */
    async _processRegistration() {
        const operationResult = await this.bot.processRegistration();
        await fileOperations.exportResult(operationResult, 'register');
    }

    /** Обработка верификации аккаунта */
    async _processVerify() {
        const operationResult = await this.bot.processVerify();
        await fileOperations.exportResult(operationResult, 'verify');
    }

    /** Обработка логина аккаунта */
    async _processLogin() {
        const operationResult = await this.bot.processLogin();
        await fileOperations.exportResult(operationResult, 'login');
    }

    /** Обработка завершения задач аккаунта */
    async _processCompleteTasks() {
        const operationResult = await this.bot.processCompleteTasks();
        await fileOperations.exportResult(operationResult, 'tasks');
    }

    /** Обработка экспорта статистики аккаунта */
    async _processExportStats() {
        const statData = await this.bot.processExportStats();
        await fileOperations.exportStats(statData);
    }

    /** Обработка режима фарма аккаунта */
    async _processFarm() {
        await this.bot.processFarm();
    }
}
