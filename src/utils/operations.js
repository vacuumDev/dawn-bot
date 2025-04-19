/**
 * @typedef {{ identifier: string, data: string, status: boolean }} OperationResult
 * @typedef {{ success: boolean, referralPoint: object|null, rewardPoint: object|null }} StatisticData
 */

/**
 * Возвращает неуспешный результат операции
 * @param {string} email
 * @param {string} password
 * @returns {OperationResult}
 */
export function operationFailed(email, password) {
    return {
        identifier: email,
        data: password,
        status: false,
    };
}

/**
 * Возвращает успешный результат операции
 * @param {string} email
 * @param {string} password
 * @returns {OperationResult}
 */
export function operationSuccess(email, password) {
    return {
        identifier: email,
        data: password,
        status: true,
    };
}

/**
 * Возвращает успешные данные статистики
 * @param {{ referralPoint: object, rewardPoint: object }} userInfo
 * @returns {StatisticData}
 */
export function operationExportStatsSuccess(userInfo) {
    return {
        success: true,
        referralPoint: userInfo.referralPoint,
        rewardPoint: userInfo.rewardPoint,
    };
}

/**
 * Возвращает неуспешный результат статистики
 * @returns {StatisticData}
 */
export function operationExportStatsFailed() {
    return {
        success: false,
        referralPoint: null,
        rewardPoint: null,
    };
}

/**
 * Преобразует текст ошибки в читабельный формат
 * @param {Error} error
 * @returns {string}
 */
export function validateError(error) {
    const msg = String(error).toLowerCase();

    if (msg.includes('curl: (7)') || msg.includes('curl: (28)') || msg.includes('curl: (16)') || msg.includes('connect tunnel failed')) {
        return 'Proxy failed';
    }
    if (msg.includes('timed out') || msg.includes('operation timed out')) {
        return 'Connection timed out';
    }
    if (msg.includes('empty document') || msg.includes('expecting value')) {
        return 'Received empty response';
    }
    if (msg.includes('curl: (35)') || msg.includes('curl: (97)') || msg.includes('eof') || msg.includes('curl: (56)') || msg.includes('ssl')) {
        return 'SSL Error. If there are a lot of such errors, try installing certificates.';
    }
    if (msg.includes('417 expectation failed')) {
        return '417 Expectation Failed';
    }
    if (msg.includes('unsuccessful tunnel')) {
        return 'Unsuccessful TLS Tunnel';
    }
    if (msg.includes('connection error')) {
        return 'Connection Error';
    }

    return msg;
}
