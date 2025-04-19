import config from "./config.js";

export default class ProxyManager {
  /**
   * Генерирует случайный 12-символьный шестнадцатеричный идентификатор.
   * @returns {string} Случайная 12-символьная строка в шестнадцатеричном формате.
   */
  static generateRandom12Hex() {
    let hex = "";
    for (let i = 0; i < 12; i++) {
      hex += Math.floor(Math.random() * 16).toString(16);
    }
    return hex;
  }

  static getRandomCountry() {
    const countries = config.application_settings.countries;
    if (!Array.isArray(countries) || countries.length === 0) {
      throw new Error(
        "config.application_settings.countries is not a non-empty array",
      );
    }
    const idx = Math.floor(Math.random() * countries.length);
    return countries[idx];
  }

  static getProxy() {
    return config.application_settings.proxy_url
      .replace("{ID}", this.generateRandom12Hex())
      .replace("{COUNTRY}", this.getRandomCountry());
  }
}
