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
    async _process_registration() {
        const operationResult = await this.bot.processRegistration();
        await fileOperations.exportResult(operationResult, 'register');
    }

    /** Обработка верификации аккаунта */
    async _process_verify() {
        const operationResult = await this.bot.processVerify();
        await fileOperations.exportResult(operationResult, 'verify');
    }

    /** Обработка логина аккаунта */
    async _process_login() {
        const operationResult = await this.bot.processLogin();
        await fileOperations.exportResult(operationResult, 'login');
    }

    /** Обработка завершения задач аккаунта */
    async _process_complete_tasks() {
        const operationResult = await this.bot.processCompleteTasks();
        await fileOperations.exportResult(operationResult, 'tasks');
    }

    /** Обработка экспорта статистики аккаунта */
    async _process_export_stats() {
        const statData = await this.bot.processExportStats();
        await fileOperations.exportStats(statData);
    }

    /** Обработка режима фарма аккаунта */
    async _process_farm() {
        await this.bot.processFarm();
    }
}
