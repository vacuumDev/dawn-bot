// Импорт зависимостей и конфигурации
import axios from "axios";
import { faker } from "@faker-js/faker";
import config from "../../utils/config.js";
import {HttpsProxyAgent} from "https-proxy-agent";
import {HttpProxyAgent} from "http-proxy-agent";
// Базовый класс APIClient
class APIClient {
  static EXTENSION_API_URL = "https://www.aeropres.in/chromeapi/dawn";
  static DASHBOARD_API_URL = "https://ext-api.dawninternet.com/chromeapi/dawn";

  /**
   * @param {string|null} proxy - адрес прокси в формате "host:port", либо null
   */
  constructor(proxy = null) {
    this.proxy = proxy;
    this.axiosInstance = this._createSession();
    this.userAgent =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
  }

  _createSession() {
    const axiosConfig = {
      timeout: 30000, // 30 секунд
      headers: {},
    };

    if (this.proxy) {
      axiosConfig.httpsAgent = new HttpsProxyAgent(this.proxy)
      axiosConfig.httpAgent = new HttpProxyAgent(this.proxy)
    }

    return axios.create(axiosConfig);
  }

  async clearRequest(url) {
    // Создаётся новая сессия для чистого запроса
    const session = this._createSession();
    try {
      const response = await session.get(url, { maxRedirects: 10 });
      return response;
    } catch (error) {
      throw error;
    }
  }

  static _verifyResponse(responseData) {
    if (typeof responseData === "object") {
      if (
        ("status" in responseData && responseData.status === false) ||
        ("success" in responseData && responseData.success === false)
      ) {
        throw new Error(
          `API returned an error: ${JSON.stringify(responseData)}`,
        );
      }
    }
  }

  /**
   * Универсальный метод отправки запроса с повторными попытками.
   *
   * @param {object} options - настройки запроса:
   *   requestType - "POST", "GET", "OPTIONS"
   *   apiType - "EXTENSION" или "DASHBOARD"
   *   method - часть пути (например, "/v1/puzzle/get-puzzle")
   *   jsonData - тело запроса (для POST)
   *   params - GET-параметры
   *   url - если передан, используется вместо формирования URL
   *   headers - дополнительные заголовки
   *   verify - проверять ли ответ
   *   maxRetries - число попыток
   *   retryDelay - задержка между попытками (в мс)
   */
  async sendRequest({
    requestType = "POST",
    apiType = "EXTENSION",
    method = "",
    jsonData = null,
    params = null,
    url = null,
    headers = {},
    cookies = null, // Для работы с cookies при необходимости можно добавить специализированный модуль
    verify = true,
    maxRetries = 2,
    retryDelay = 3000,
  }) {
    if (!url) {
      url =
        (apiType === "EXTENSION"
          ? APIClient.EXTENSION_API_URL
          : APIClient.DASHBOARD_API_URL) + method;
    }

    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        const requestConfig = {
          url,
          method: requestType.toLowerCase(),
          headers: Object.keys(headers).length
            ? headers
            : { "User-Agent": this.userAgent },
          params,
          data: jsonData,
        };

        const response = await this.axiosInstance.request(requestConfig);

        if (verify) {
          if (
            response.status === 403 &&
            typeof response.data === "string" &&
            response.data.includes("403 Forbidden")
          ) {
            throw new Error(`Proxy forbidden - ${response.status}`);
          } else if (response.status === 403) {
            throw new Error("Session is rate limited or blocked by Cloudflare");
          }

          if ([500, 502, 503, 504].includes(response.status)) {
            throw new Error(`Server error - ${response.status}`);
          }

          APIClient._verifyResponse(response.data);
          return response.data;
        }
        return response.data;
      } catch (error) {
        if (attempt === maxRetries - 1) {
          throw new Error(
            `Failed to send request after ${maxRetries} attempts: ${error.message}`,
          );
        }
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
      attempt++;
    }
    throw new Error(`Failed to send request after ${maxRetries} attempts`);
  }

  async closeSession() {
    // Для axios явного закрытия сессии не требуется
    return;
  }
}

// Класс DawnExtensionAPI, наследующий APIClient
class DawnExtensionAPI extends APIClient {
  /**
   * @param {string|null} authToken - токен авторизации, если есть
   * @param {string|null} proxy - адрес прокси
   */
  constructor(authToken = null, proxy = null) {
    super(proxy);
    this.authToken = authToken;
  }

  async getPuzzleId(appId) {
    const headers = {
      "User-Agent": this.userAgent,
      Accept: "*/*",
      Origin: "chrome-extension://fpdkjdnhkakefebpekbdhillbhonfjjp",
      "Accept-Language": "uk-UA,uk;q=0.9,en-US;q=0.8,en;q=0.7",
      Host: "ext-api.dawninternet.com",
    };

    const response = await this.sendRequest({
      apiType: "DASHBOARD",
      method: "/v1/puzzle/get-puzzle",
      requestType: "GET",
      params: { appid: appId },
      headers,
    });
    return response.puzzle_id;
  }

  async getPuzzleImage(puzzleId, appId) {
    const headers = {
      "User-Agent": this.userAgent,
      Accept: "*/*",
      Origin: "chrome-extension://fpdkjdnhkakefebpekbdhillbhonfjjp",
      "Accept-Language": "uk-UA,uk;q=0.9,en-US;q=0.8,en;q=0.7",
      Host: "ext-api.dawninternet.com",
    };

    const response = await this.sendRequest({
      apiType: "DASHBOARD",
      method: "/v1/puzzle/get-puzzle-image",
      requestType: "GET",
      params: { puzzle_id: puzzleId, appid: appId },
      headers,
    });
    return response.imgBase64;
  }

  async getAppId() {
    const headers = {
      "User-Agent": this.userAgent,
      Accept: "*/*",
      Origin: "chrome-extension://fpdkjdnhkakefebpekbdhillbhonfjjp",
      "Accept-Language": "uk-UA,uk;q=0.9,en-US;q=0.8,en;q=0.7",
      Host: "ext-api.dawninternet.com",
    };

    const params = {
      app_v: "1.1.4",
    };

    const response = await this.sendRequest({
      apiType: "DASHBOARD",
      method: "/v1/appid/getappid",
      requestType: "GET",
      params,
      headers,
    });
    return response.data.appid;
  }

  async register(email, password, captchaToken, appId) {
    const headers = {
      "User-Agent": this.userAgent,
      Accept: "application/json, text/plain, */*",
      "Content-Type": "application/json",
      Origin: "https://dashboard.dawninternet.com",
      Referer: "https://dashboard.dawninternet.com/",
      "Accept-Language": "uk-UA,uk;q=0.9,en-US;q=0.8,en;q=0.7",
      "Accept-Encoding": "gzip, deflate, br",
    };

    const countries = [
      "AL",
      "AD",
      "AT",
      "BY",
      "BE",
      "BA",
      "BG",
      "HR",
      "CZ",
      "DK",
      "EE",
      "FI",
      "FR",
      "DE",
      "GR",
      "HU",
      "IS",
      "IE",
      "IT",
      "LV",
      "LI",
      "LT",
      "LU",
      "MT",
      "MD",
      "MC",
      "ME",
      "NL",
      "MK",
      "NO",
      "PL",
      "PT",
      "RO",
      "RU",
      "SM",
      "RS",
      "SK",
      "SI",
      "ES",
      "SE",
      "CH",
      "UA",
      "GB",
      "VA",
      "UA",
    ];

    const jsonData = {
      firstname: faker.name.firstName(),
      lastname: faker.name.lastName(),
      email,
      mobile: "",
      country: countries[Math.floor(Math.random() * countries.length)],
      password,
      referralCode:
        config.referralCodes && config.referralCodes.length > 0
          ? config.referralCodes[
              Math.floor(Math.random() * config.referralCodes.length)
            ]
          : "",
      token: captchaToken,
      isMarketing: false,
      browserName: "chrome",
    };

    return await this.sendRequest({
      apiType: "DASHBOARD",
      method: "/v2/dashboard/user/validate-register",
      requestType: "POST",
      jsonData,
      params: { appid: appId },
      headers,
    });
  }

  _ensureAuthToken() {
    if (!this.authToken) {
      throw new Error("Auth token is required");
    }
  }

  async keepalive(email, appId) {
    this._ensureAuthToken();
    const headers = {
      "User-Agent": this.userAgent,
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.authToken}`,
      Accept: "*/*",
      Origin: "chrome-extension://fpdkjdnhkakefebpekbdhillbhonfjjp",
      "Accept-Language": "uk-UA,uk;q=0.9,en-US;q=0.8,en;q=0.7",
      "Accept-Encoding": "gzip, deflate, br",
    };

    const jsonData = {
      username: email,
      extensionid: "fpdkjdnhkakefebpekbdhillbhonfjjp",
      numberoftabs: 0,
      _v: "1.1.4",
    };

    return await this.sendRequest({
      method: "/v1/userreward/keepalive",
      requestType: "POST",
      jsonData,
      params: { appid: appId },
      headers,
      verify: false,
    });
  }

  async userInfo(appId) {
    this._ensureAuthToken();
    const headers = {
      Authorization: `Bearer ${this.authToken}`,
      "User-Agent": this.userAgent,
      "Content-Type": "application/json",
      Accept: "*/*",
      Origin: "chrome-extension://fpdkjdnhkakefebpekbdhillbhonfjjp",
      "Accept-Language": "uk-UA,uk;q=0.9,en-US;q=0.8,en;q=0.7",
      "Accept-Encoding": "gzip, deflate, br",
    };

    const response = await this.sendRequest({
      url: "https://www.aeropres.in/api/atom/v1/userreferral/getpoint",
      requestType: "GET",
      headers,
      params: { appid: appId },
    });
    return response.data;
  }

  async verifyRegistration(key, captchaToken) {
    const headers = {
      "User-Agent": this.userAgent,
      "Content-Type": "application/json",
      Accept: "*/*",
      Origin: "https://verify.dawninternet.com",
      "Accept-Language": "uk-UA,uk;q=0.9,en-US;q=0.8,en;q=0.7",
      "Accept-Encoding": "gzip, deflate, br",
    };

    return await this.sendRequest({
      url: "https://verify.dawninternet.com/chromeapi/dawn/v1/userverify/verifycheck",
      requestType: "POST",
      jsonData: { token: captchaToken },
      headers,
      params: { key },
    });
  }

  async resendVerifyLink(email, puzzleId, answer, appId) {
    const headers = {
      Accept: "*/*",
      "Accept-Language": "en-US,en;q=0.9,ru;q=0.8",
      "Content-Type": "application/json",
      Origin: "chrome-extension://fpdkjdnhkakefebpekbdhillbhonfjjp",
      "User-Agent": this.userAgent,
    };

    const jsonData = {
      username: email,
      puzzle_id: puzzleId,
      ans: answer,
    };

    return await this.sendRequest({
      method: "/v1/user/resendverifylink/v2",
      requestType: "POST",
      jsonData,
      params: { appid: appId },
      headers,
    });
  }

  async completeTasks(
    appId,
    tasks = ["telegramid", "discordid", "twitter_x_id"],
    delay = 1000,
  ) {
    this._ensureAuthToken();
    const headers = {
      Authorization: `Bearer ${this.authToken}`,
      "User-Agent": this.userAgent,
      "Content-Type": "application/json",
      Accept: "*/*",
      Origin: "chrome-extension://fpdkjdnhkakefebpekbdhillbhonfjjp",
      "Accept-Language": "uk-UA,uk;q=0.9,en-US;q=0.8,en;q=0.7",
      "Accept-Encoding": "gzip, deflate, br",
    };

    for (const task of tasks) {
      await this.sendRequest({
        method: "/v1/profile/update",
        requestType: "POST",
        jsonData: { [task]: task },
        headers,
        params: { appid: appId },
      });
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  async verifySession(appId) {
    try {
      await this.userInfo(appId);
      return [true, "Session is valid"];
    } catch (error) {
      if (error.message.includes("Server error")) {
        return [true, "Server error"];
      } else {
        return [false, error.message];
      }
    }
  }

  async login(email, password, puzzleId, answer, appId) {
    const headers = {
      "User-Agent": this.userAgent,
      "Content-Type": "application/json",
      Accept: "*/*",
      Origin: "chrome-extension://fpdkjdnhkakefebpekbdhillbhonfjjp",
      "Accept-Language": "uk-UA,uk;q=0.9,en-US;q=0.8,en;q=0.7",
      "Accept-Encoding": "gzip, deflate, br",
    };

    // Текущее время в ISO-формате
    const formattedDatetime = new Date().toISOString();

    const jsonData = {
      username: email,
      password: password,
      logindata: {
        _v: { version: "1.1.4" },
        datetime: formattedDatetime,
      },
      puzzle_id: puzzleId,
      ans: answer,
      appid: appId,
    };

    const response = await this.sendRequest({
      method: "/v1/user/login/v2",
      requestType: "POST",
      jsonData,
      params: { appid: appId },
      headers,
    });
    const bearer = response.data && response.data.token;
    if (bearer) {
      return bearer;
    } else {
      throw new Error(`Failed to login: ${JSON.stringify(response)}`);
    }
  }
}

export { APIClient, DawnExtensionAPI };
