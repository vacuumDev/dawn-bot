export default class ProxyManager {
    /**
     * Генерирует случайный 12-символьный шестнадцатеричный идентификатор.
     * @returns {string} Случайная 12-символьная строка в шестнадцатеричном формате.
     */
    static generateRandom12Hex() {
        let hex = '';
        for (let i = 0; i < 12; i++) {
            hex += Math.floor(Math.random() * 16).toString(16);
        }
        return hex;
    }

    /**
     * Заменяет маркеры {ID} и {COUNTRY} в строке proxyTemplate
     * на сгенерированный шестнадцатеричный идентификатор и указанный код страны.
     *
     * @param {string} proxyTemplate - Шаблон прокси, содержащий маркеры "{ID}" и "{COUNTRY}".
     * @param {string} country - Код страны, которым нужно заменить маркер "{COUNTRY}".
     * @returns {string} Сформированная строка прокси.
     */
    static generateProxy(proxyTemplate, country) {
        return proxyTemplate
            .replace("{ID}", this.generateRandom12Hex())
            .replace("{COUNTRY}", country);
    }
}
