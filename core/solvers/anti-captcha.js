import axios from 'axios';

/**
 * Функция задержки (аналог asyncio.sleep)
 * @param {number} ms - время задержки в миллисекундах
 * @returns {Promise<void>}
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class AntiCaptchaSolver {
    static BASE_URL = 'https://api.anti-captcha.com';

    /**
     * @param {string} apiKey - API-ключ для anti-captcha
     * @param {number} maxAttempts - максимальное число попыток получения результата капчи
     */
    constructor(apiKey, maxAttempts) {
        this.apiKey = apiKey;
        this.maxAttempts = maxAttempts;
        this.client = axios.create({
            timeout: 10000, // 10 секунд
        });
    }

    /**
     * Решает капчу для Turnstile.
     * @returns {Promise<[any, boolean]>} Кортеж: [результат или сообщение об ошибке, флаг успеха]
     */
    async solveTurnistile() {
        try {
            const captchaData = {
                clientKey: this.apiKey,
                softId: 1201,
                task: {
                    type: 'TurnstileTaskProxyless',
                    websiteURL: 'https://dashboard.dawninternet.com/',
                    websiteKey: '0x4AAAAAAA48wVDquA-98fyV',
                },
            };

            const response = await this.client.post(
                `${AntiCaptchaSolver.BASE_URL}/createTask`,
                captchaData
            );
            const data = response.data;

            if (data.errorId === 0) {
                return await this.getCaptchaResult(data.taskId);
            }
            return [data.errorDescription, false];
        } catch (err) {
            if (err.response) {
                return [`HTTP error occurred: ${err.message}`, false];
            }
            return [`An unexpected error occurred: ${err.message}`, false];
        }
    }

    /**
     * Решает капчу с изображением.
     * @param {string} image - строка с изображением (например, base64)
     * @returns {Promise<[any, boolean]>} Кортеж: [результат или сообщение об ошибке, флаг успеха]
     */
    async solveImage(image) {
        try {
            const captchaData = {
                clientKey: this.apiKey,
                softId: 1201,
                task: {
                    type: 'ImageToTextTask',
                    body: image,
                    phrase: false,
                    case: true,
                    numeric: 0,
                    math: false,
                    minLength: 6,
                    maxLength: 6,
                    comment: 'Pay special attention to the letters and signs.',
                },
            };

            const response = await this.client.post(
                `${AntiCaptchaSolver.BASE_URL}/createTask`,
                captchaData
            );
            const data = response.data;

            if (data.errorId === 0) {
                return await this.getCaptchaResult(data.taskId);
            }
            return [data.errorDescription, false];
        } catch (err) {
            if (err.response) {
                return [`HTTP error occurred: ${err.message}`, false];
            }
            return [`An unexpected error occurred: ${err.message}`, false];
        }
    }

    /**
     * Получает результат решения капчи.
     * Проводит несколько попыток (время ожидания 3 секунды между ними).
     * @param {number|string} taskId - идентификатор задачи капчи
     * @returns {Promise<[any, boolean]>} Кортеж: [токен/текст или сообщение об ошибке, флаг успеха]
     */
    async getCaptchaResult(taskId) {
        for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
            try {
                const response = await this.client.post(
                    `${AntiCaptchaSolver.BASE_URL}/getTaskResult`,
                    {
                        clientKey: this.apiKey,
                        taskId,
                    }
                );
                const result = response.data;

                if (result.errorId !== 0) {
                    return [result.errorDescription, false];
                }

                if (result.status === 'ready') {
                    // Если присутствует token, возвращаем его, иначе текст
                    if (result.solution.token) {
                        return [result.solution.token, true];
                    }
                    return [result.solution.text, true];
                }
                await sleep(3000);
            } catch (err) {
                if (err.response) {
                    return [`HTTP error occurred: ${err.message}`, false];
                }
                return [`An unexpected error occurred: ${err.message}`, false];
            }
        }
        return ['Max time for solving exhausted', false];
    }

    /**
     * Сообщает о некорректном решении капчи.
     * @param {number|string} taskId - идентификатор задачи капчи
     * @returns {Promise<[any, boolean]>} Кортеж: [результат запроса или сообщение об ошибке, флаг успеха]
     */
    async reportBad(taskId) {
        try {
            const response = await this.client.post(
                `${AntiCaptchaSolver.BASE_URL}/reportIncorrectImageCaptcha`,
                {
                    clientKey: this.apiKey,
                    taskId,
                }
            );
            return [response.data, true];
        } catch (err) {
            if (err.response) {
                return [`HTTP error occurred: ${err.message}`, false];
            }
            return [`An unexpected error occurred: ${err.message}`, false];
        }
    }
}

export default AntiCaptchaSolver;
