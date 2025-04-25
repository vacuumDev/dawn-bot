import config from "../../utils/config.js";
import fileOperations from "../../utils/file_utils.js";
import captchaSolver from "./../solvers/anti-captcha.js";
import proxyManager from "../../utils/proxy-manager.js";
import { DawnExtensionAPI } from "../api/dawn.js";
import {
  operationFailed,
  operationSuccess,
  operationExportStatsSuccess,
  operationExportStatsFailed,
  validateError,
} from "../../utils/operations.js";
import Accounts from "../database/Accounts.js";
import {
  APIError,
  SessionRateLimited,
  CaptchaSolvingFailed,
  APIErrorType,
  ProxyForbidden,
  EmailValidationFailed,
} from "../exceptions/base.js";
import { HttpsProxyAgent } from "https-proxy-agent";
import { HttpProxyAgent } from "http-proxy-agent";
import { delay } from "../../utils/delay.js";
import EmailHandler, {EmailValidator, LinkExtractor} from "../../utils/email-handler.js";

export class Bot {
  constructor(accountData) {
    this.accountData = accountData;
  }

  static async handleInvalidAccount(email, password, reason, log = true) {
    switch (reason) {
      case "unverified":
        if (log)
          console.error(
            `Account: ${email} | Email not verified | Removed from list`,
          );
        await fileOperations.exportInvalidAccount(
          email,
          password,
          "unverified",
        );
        break;
      case "banned":
        if (log)
          console.error(
            `Account: ${email} | Account is banned | Removed from list`,
          );
        await fileOperations.exportInvalidAccount(email, password, "banned");
        break;
      case "unregistered":
        if (log)
          console.error(
            `Account: ${email} | Email not registered | Removed from list`,
          );
        await fileOperations.exportInvalidAccount(
          email,
          password,
          "unregistered",
        );
        break;
      case "unlogged":
        if (log)
          console.error(
            `Account: ${email} | Not logged in | Removed from list`,
          );
        await fileOperations.exportInvalidAccount(email, password, "unlogged");
        break;
    }
    config.accounts_to_farm = config.accounts_to_farm.filter(
      (acc) => acc.email !== email,
    );
  }

  async handleApiError(error, attempt, maxAttempts, context, dbAccountValue) {
    const isLast = attempt === maxAttempts - 1;
    const { email, password } = this.accountData;
    const delay = config.attempts_and_delay_settings.error_delay;
    const actionMap = {
      registration: "register",
      verify: "verify",
      login: "login",
      tasks: "complete tasks",
      stats: "export stats",
      keepalive: "send keepalive",
    };
    const action = actionMap[context];
    const retryLog = (msg) =>
      console.warn(
        `Account: ${email} | ${msg} | Attempt ${attempt + 1}/${maxAttempts} | Retrying in ${delay}s`,
      );
    const finalFail = () => {
      console.error(
        `Account: ${email} | Max attempts reached, unable to ${action}`,
      );
      return context === "stats"
        ? operationExportStatsFailed()
        : operationFailed(email, password);
    };

    switch (error.errorType) {
      case APIErrorType.INCORRECT_CAPTCHA:
        retryLog("Captcha answer incorrect");
        if (!isLast) await new Promise((r) => setTimeout(r, delay * 1000));
        return null;
      case APIErrorType.CAPTCHA_EXPIRED:
        retryLog("Captcha expired");
        if (!isLast) await new Promise((r) => setTimeout(r, delay * 1000));
        return null;
      case APIErrorType.INVALID_CAPTCHA_TOKEN:
        retryLog("Invalid captcha token");
        if (!isLast) await new Promise((r) => setTimeout(r, delay * 1000));
        return null;
      case APIErrorType.EMAIL_EXISTS:
        console.warn(`Account: ${email} | Email already exists`);
        return operationSuccess(email, password);
      case APIErrorType.UNVERIFIED_EMAIL:
        await Bot.handleInvalidAccount(email, password, "unverified");
        return operationFailed(email, password);
      case APIErrorType.BANNED:
        await Bot.handleInvalidAccount(email, password, "banned");
        return operationFailed(email, password);
      case APIErrorType.UNREGISTERED_EMAIL:
        await Bot.handleInvalidAccount(email, password, "unregistered");
        return operationFailed(email, password);
      case APIErrorType.SESSION_EXPIRED:
        await Bot.handleInvalidAccount(email, password, "unlogged");
        if (dbAccountValue) await dbAccountValue.delete();
        console.warn(`Account: ${email} | Session expired`);
        return operationFailed(email, password);
      default:
        if (
          error.errorMessage &&
          error.errorMessage.includes("Something went wrong")
        ) {
          const domain = email.split("@")[1];
          console.warn(`Account: ${email} | Domain <${domain}> likely banned`);
          if (["tasks", "stats"].includes(context)) {
            await Bot.handleInvalidAccount(email, password, "banned", false);
            return context === "stats"
              ? operationExportStatsFailed()
              : operationFailed(email, password);
          }
        } else {
          console.error(`Account: ${email} | Error during ${action}:`, error);
        }
    }
    return finalFail();
  }

  async handleGenericException(
    error,
    attempt,
    maxAttempts,
    context,
    dbAccountValue,
  ) {
    const isLast = attempt === maxAttempts - 1;
    const { email, password } = this.accountData;
    const verbMap = {
      registration: "registering",
      verify: "verifying",
      login: "logging in",
      tasks: "completing tasks",
      stats: "exporting stats",
      keepalive: "sending keepalive",
    };
    console.error(
      `Account: ${email} | Error while ${verbMap[context]}: ${validateError(error)}`,
    );
    if (!isLast) {
      await this._updateAccountProxy(dbAccountValue, attempt);
      return null;
    }
    console.error(`Account: ${email} | Max attempts reached`);
    return context === "stats"
      ? operationExportStatsFailed()
      : operationFailed(email, password);
  }

  static getSleepUntil() {
    const secs = config.application_settings.keepalive_interval;
    return new Date(Date.now() + secs * 1000);
  }


  /**
   * Валидирует электронную почту через IMAP, используя HTTP(S)-прокси при необходимости
   * @param {string|null} proxyUrl
   */
  async _validateEmail(proxyUrl) {
    // Создаем агент для axios/imap, если есть прокси
    let agent;
    if (proxyUrl) {
      agent = proxyUrl.startsWith('https')
          ? new HttpsProxyAgent(proxyUrl)
          : new HttpProxyAgent(proxyUrl);
    }

    if (config.redirect_settings.enabled) {
      return new EmailValidator(
          config.redirect_settings.imap_server,
          config.redirect_settings.email,
          config.redirect_settings.password
      ).validate(agent);
    }

    return new EmailValidator(
        this.accountData.imap_server,
        this.accountData.email,
        this.accountData.password
    ).validate(agent);
  }

  /**
   * Проверяет результат _validateEmail
   */
  async _isEmailValid(proxyUrl) {
  return  true;
    const res = await this._validateEmail(proxyUrl);
    if (!res.status) {
      if (res.data && res.data.includes("validation failed")) {
        throw new EmailValidationFailed(res.data);
      }
      console.error(
          `Account: ${this.accountData.email} | Invalid email: ${res.data}`
      );
      return false;
    }
    return true;
  }

  async _extractLink(timestamp) {
    // При проксировании передаем URL строки, агенты создаются внутри LinkExtractor
    // if (config.redirect_settings.enabled) {
    //   return new LinkExtractor(
    //       config.redirect_settings.imap_server,
    //       config.redirect_settings.email,
    //       config.redirect_settings.password,
    //       { redirectEmail: this.accountData.email }
    //   ).extractLink(
    //       config.redirect_settings.use_proxy
    //           ? this.accountData.activeAccountProxy
    //           : null
    //   );
    // }

    const link = await EmailHandler.fetchOtpFromEmail(this.accountData.email,
        this.accountData.refreshToken,
        this.accountData.clientId,
        [
          /https:\/\/www\.aeropres\.in\/chromeapi\/dawn\/v1\/userverify\/verifyconfirm\?key=[^\s]+/,
          /https?:\/\/webmail\.online\/go\.php\?r=[^\s]+/,
          // /https?:\/\/u\d+\.ct\.sendgrid\.net\/ls\/click\?upn=[^\s]+/,
          /key=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/
        ],
        timestamp
    );

    console.log(link)
    return link;
    // return (
    //     this.accountData.imap_server,
    //     this.accountData.email,
    //     this.accountData.password
    // ).extractLink(
    //     config.imap_settings.use_proxy_for_imap
    //         ? this.accountData.activeAccountProxy
    //         : null
    // );
  }

  async _updateAccountProxy(dbAccountValue, attempt) {
    const delaySec = config.attempts_and_delay_settings.error_delay;
    console.info(
        `Account: ${this.accountData.email} | Changing proxy, retry in ${delaySec}s...`
    );
    const newProxy = await proxyManager.getProxy();
    const url = typeof newProxy === 'string' ? newProxy : newProxy.asUrl;
    if (dbAccountValue) {
      await Accounts.updateAccount(dbAccountValue.email, { proxy: url });
    }
    this.accountData.activeAccountProxy = url;
    await delay(delaySec * 1000);
  }


  async getCaptchaData(api, type, maxAttempts = 5, appId = null) {
    const handleImage = async () => {
      console.info(
        `Account: ${this.accountData.email} | Solving image captcha...`,
      );
      const puzzleId = await api.getPuzzleId(appId);
      const img = await api.getPuzzleImage(puzzleId, appId);
      console.info(
        `Account: ${this.accountData.email} | Received captcha image`,
      );
      const [answer, solved, ...rest] = await captchaSolver.solveImage(img);
      if (solved && answer.length === 6) {
        console.info(
          `Account: ${this.accountData.email} | Captcha solved: ${answer}`,
        );
        return [puzzleId, answer, rest[0] || null];
      }
      if (rest.length) await captchaSolver.reportBad(rest[0]);
      throw new Error(answer);
    };
    const handleTurn = async () => {
      console.info(
        `Account: ${this.accountData.email} | Solving Cloudflare challenge...`,
      );
      const [ans, solved, ...rest] = await captchaSolver.solveTurnistile();
      if (solved) {
        console.info(`Account: ${this.accountData.email} | Cloudflare solved`);
        return [ans, rest[0] || null];
      }
      throw new Error(`Challenge failed: ${ans}`);
    };
    const handler = type === "image" ? handleImage : handleTurn;
    for (let i = 0; i < maxAttempts; i++) {
      try {
        return await handler();
      } catch (err) {
        if (err instanceof SessionRateLimited || err instanceof ProxyForbidden)
          throw err;
        console.error(
          `Account: ${this.accountData.email} | Captcha error: ${err.message}`,
        );
        if (i === maxAttempts - 1) {
          throw new CaptchaSolvingFailed(
            `Failed after ${maxAttempts} attempts`,
          );
        }
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }

  async processGetAppId(api) {
    const maxAttempts =
      config.attempts_and_delay_settings.max_attempts_to_receive_app_id;
    const delay = config.attempts_and_delay_settings.error_delay;
    for (let i = 0; i < maxAttempts; i++) {
      try {
        console.info(`Account: ${this.accountData.email} | Fetching app ID...`);
        const id = await api.getAppId();
        console.info(`Account: ${this.accountData.email} | App ID: ${id}`);
        return id;
      } catch (err) {
        if (err instanceof APIError) {
          console.error(err);
          return null;
        }
        console.error(
          `Account: ${this.accountData.email} | Error fetching app ID: ${err.message}`,
        );
        if (i < maxAttempts - 1) {
          const p = await proxyManager.getProxy();
          api = new DawnExtensionAPI(null, proxy);
          await new Promise((r) => setTimeout(r, delay * 1000));
        }
      }
    }
    return null;
  }

  async _getConfirmationKey(api, timestamp) {
    const link = await this._extractLink(timestamp);
    try {
      return link.split("key=")[1];
    } catch {
      const res = await api.clearRequest(link);
      return res.split("key=")[1];
    }
  }

  async _verifyRegistration(api, key, appId) {
    const [token] = await this.getCaptchaData(
      api,
      "turnistale",
      undefined,
      appId,
    );
    return api.verifyRegistration(key, token);
  }

  async _registerAccount(api, appId) {
    const [token] = await this.getCaptchaData(
      api,
      "turnistale",
      undefined,
      appId,
    );
    return api.register(
      this.accountData.email,
      this.accountData.password,
      token,
      appId,
    );
  }

  async _loginAccount(api, appId) {
    const [puzzleId, answer] = await this.getCaptchaData(
      api,
      "image",
      undefined,
      appId,
    );
    return api.login(
      this.accountData.email,
      this.accountData.password,
      puzzleId,
      answer,
      appId,
    );
  }

  static async _prepareProxyAndAppId(dbVal) {
    if (dbVal && (dbVal.activeAccountProxy || dbVal.appId)) {
      let proxy = dbVal.activeAccountProxy;
      if (!proxy) {
        const p = await proxyManager.getProxy();
        proxy = p.asUrl || p;
        await Accounts.updateAccount(dbVal.email, { proxy: proxy });
      }
      return [proxy, dbVal.appId];
    }
    const p = await proxyManager.getProxy();
    return [p.asUrl || p, null];
  }

  async processRegistration() {
    const maxAttempts =
      config.attempts_and_delay_settings.max_register_attempts;

    for (let i = 0; i < maxAttempts; i++) {
      let dbVal = null;
      let api = null;
      try {
        dbVal = await Accounts.getAccount(this.accountData.email);
        if (
          config.application_settings.skip_logged_accounts &&
          dbVal?.authToken
        ) {
          console.warn(`Skipped ${this.accountData.email}`);
          return operationFailed(
            this.accountData.email,
            this.accountData.password,
          );
        }
        let [proxy, appId] = await Bot._prepareProxyAndAppId(dbVal);
        if (!(await this._isEmailValid(proxy))) {
          return operationFailed(
            this.accountData.email,
            this.accountData.password,
          );
        }
        const timestampRegistration = Date.now();
        api = new DawnExtensionAPI(null, proxy);
        appId = appId || (await this.processGetAppId(api));
        if (!appId)
          return operationFailed(
            this.accountData.email,
            this.accountData.password,
          );
        if (!dbVal) {
          dbVal = await Accounts.createOrUpdateAccount(
            this.accountData.email,
            this.accountData.password,
            appId,
            null,
            proxy,
          );
        }
        await this._registerAccount(api, appId);
        console.info(`Registration initiated for ${this.accountData.email}`);
        const key = await this._getConfirmationKey(api, timestampRegistration);
        if (!key) {
          await Bot.handleInvalidAccount(
            this.accountData.email,
            this.accountData.password,
            "unverified",
            false,
          );
          return operationFailed(
            this.accountData.email,
            this.accountData.password,
          );
        }
        await this._verifyRegistration(api, key, appId);
        return operationSuccess(
          this.accountData.email,
          this.accountData.password,
        );
      } catch (err) {
        if (err instanceof APIError) {
          const res = await this.handleApiError(
            err,
            i,
            maxAttempts,
            "registration",
            dbVal,
          );
          if (res) return res;
        } else if (err instanceof EmailValidationFailed) {
          if (i === maxAttempts - 1)
            return operationFailed(
              this.accountData.email,
              this.accountData.password,
            );
          await this._updateAccountProxy(dbVal, i);
        } else {
          const res = await this.handleGenericException(
            err,
            i,
            maxAttempts,
            "registration",
            dbVal,
          );
          if (res) return res;
        }
      } finally {
        if (api) await api.closeSession();
      }
    }
  }

  async processVerify() {
    const maxAttempts =
      config.attempts_and_delay_settings.max_attempts_to_verify_email;
    let linkSent = false;
    for (let i = 0; i < maxAttempts; i++) {
      let dbVal = null;
      let api = null;
      try {
        dbVal = await Accounts.getAccount(this.accountData.email);
        if (
          config.application_settings.skip_logged_accounts &&
          dbVal?.authToken
        )
          return operationFailed(
            this.accountData.email,
            this.accountData.password,
          );
        let [proxy, appId] = await Bot._prepareProxyAndAppId(dbVal);
        if (!(await this._isEmailValid(proxy)))
          return operationFailed(
            this.accountData.email,
            this.accountData.password,
          );
        api = new DawnExtensionAPI(dbVal.authToken || null, proxy);
        appId = appId || (await this.processGetAppId(api));
        if (!appId)
          return operationFailed(
            this.accountData.email,
            this.accountData.password,
          );
        if (!dbVal)
          await Accounts.createOrUpdateAccount(
            this.accountData.email,
            this.accountData.password,
            appId,
            null,
            proxy,
          );
        if (!linkSent) {
          const [puzzleId, ans] = await this.getCaptchaData(
            api,
            "image",
            undefined,
            appId,
          );
          await api.resendVerifyLink(
            this.accountData.email,
            puzzleId,
            ans,
            appId,
          );
          linkSent = true;
        }
        const key = await this._getConfirmationKey(api);
        if (!key) {
          await Bot.handleInvalidAccount(
            this.accountData.email,
            this.accountData.password,
            "unverified",
            false,
          );
          return operationFailed(
            this.accountData.email,
            this.accountData.password,
          );
        }
        await this._verifyRegistration(api, key, appId);
        return operationSuccess(
          this.accountData.email,
          this.accountData.password,
        );
      } catch (err) {
        if (err instanceof APIError) {
          const res = await this.handleApiError(
            err,
            i,
            maxAttempts,
            "verify",
            dbVal,
          );
          if (res) return res;
        } else if (err instanceof EmailValidationFailed) {
          if (i === maxAttempts - 1)
            return operationFailed(
              this.accountData.email,
              this.accountData.password,
            );
          await this._updateAccountProxy(dbVal, i);
        } else {
          const res = await this.handleGenericException(
            err,
            i,
            maxAttempts,
            "verify",
            dbVal,
          );
          if (res) return res;
        }
      } finally {
        if (api) await api.closeSession();
      }
    }
  }

  async processLogin() {
    const maxAttempts = config.attempts_and_delay_settings.max_login_attempts;
    for (let i = 0; i < maxAttempts; i++) {
      let dbVal = null;
      let api = null;
      try {
        dbVal = await Accounts.getAccount(this.accountData.email);
        if (
          config.application_settings.skip_logged_accounts &&
          dbVal?.authToken
        )
          return operationFailed(
            this.accountData.email,
            this.accountData.password,
          );
        let [proxy, appId] = await Bot._prepareProxyAndAppId(dbVal);
        api = new DawnExtensionAPI(dbVal.authToken || null, proxy);
        appId = appId || (await this.processGetAppId(api));
        if (!appId)
          return operationFailed(
            this.accountData.email,
            this.accountData.password,
          );
        if (!dbVal)
          dbVal = await Accounts.createOrUpdateAccount(
            this.accountData.email,
            this.accountData.password,
            appId,
            null,
            proxy,
          );
        const token = await this._loginAccount(api, appId);
        dbVal = await Accounts.createOrUpdateAccount(
            this.accountData.email,
            this.accountData.password,
            appId,
            token,
            proxy,
        );
        return operationSuccess(
          this.accountData.email,
          this.accountData.password,
        );
      } catch (err) {
        if (err instanceof APIError) {
          const res = await this.handleApiError(
            err,
            i,
            maxAttempts,
            "login",
            dbVal,
          );
          if (res) return res;
        } else {
          const res = await this.handleGenericException(
            err,
            i,
            maxAttempts,
            "login",
            dbVal,
          );
          if (res) return res;
        }
      } finally {
        if (api) await api.closeSession();
      }
    }
  }

  async processCompleteTasks() {
    const maxAttempts = config.attempts_and_delay_settings.max_tasks_attempts;
    for (let i = 0; i < maxAttempts; i++) {
      let dbVal = null;
      let api = null;
      try {
        dbVal = await Accounts.getAccount(this.accountData.email);
        if (!dbVal || !dbVal.authToken) {
          await Bot.handleInvalidAccount(
            this.accountData.email,
            this.accountData.password,
            "unlogged",
          );
          return operationFailed(
            this.accountData.email,
            this.accountData.password,
          );
        }
        let [proxy, appId] = await Bot._prepareProxyAndAppId(dbVal);
        api = new DawnExtensionAPI(dbVal.authToken || null, proxy);
        appId = appId || (await this.processGetAppId(api));
        if (!appId)
          return operationFailed(
            this.accountData.email,
            this.accountData.password,
          );
        const info = await api.userInfo(appId);
        const pts = info.rewardPoint;
        if (
          pts.twitter_x_id_points === 5000 &&
          pts.discordid_points === 5000 &&
          pts.telegramid_points === 5000
        )
          return operationSuccess(
            this.accountData.email,
            this.accountData.password,
          );
        await api.completeTasks(appId);
        return operationSuccess(
          this.accountData.email,
          this.accountData.password,
        );
      } catch (err) {
        if (err instanceof APIError) {
          const res = await this.handleApiError(
            err,
            i,
            maxAttempts,
            "tasks",
            dbVal,
          );
          if (res) return res;
        } else {
          const res = await this.handleGenericException(
            err,
            i,
            maxAttempts,
            "tasks",
            dbVal,
          );
          if (res) return res;
        }
      } finally {
        if (api) await api.closeSession();
      }
    }
  }

  async processExportStats() {
    const maxAttempts = config.attempts_and_delay_settings.max_stats_attempts;
    for (let i = 0; i < maxAttempts; i++) {
      let dbVal = null;
      let api = null;
      try {
        dbVal = await Accounts.getAccount(this.accountData.email);
        if (!dbVal || !dbVal.authToken) {
          await Bot.handleInvalidAccount(
            this.accountData.email,
            this.accountData.password,
            "unlogged",
          );
          return operationExportStatsFailed();
        }
        let [proxy, appId] = await Bot._prepareProxyAndAppId(dbVal);
        api = new DawnExtensionAPI(dbVal.authToken || null, proxy);
        appId = appId || (await this.processGetAppId(api));
        if (!appId) return operationExportStatsFailed();
        const info = await api.userInfo(appId);
        return operationExportStatsSuccess(info);
      } catch (err) {
        if (err instanceof APIError) {
          const res = await this.handleApiError(
            err,
            i,
            maxAttempts,
            "stats",
            dbVal,
          );
          if (res) return res;
        } else {
          const res = await this.handleGenericException(
            err,
            i,
            maxAttempts,
            "stats",
            dbVal,
          );
          if (res) return res;
        }
      } finally {
        if (api) await api.closeSession();
      }
    }
  }

  async processFarm() {
    const maxAttempts =
      config.attempts_and_delay_settings.max_attempts_to_send_keepalive;
    for (let i = 0; i < maxAttempts; i++) {
      let dbVal = null;
      let api = null;
      let slept = null;
      try {
        dbVal = await Accounts.getAccount(this.accountData.email);
        if (!dbVal || !dbVal.authToken) {
          await Bot.handleInvalidAccount(
            this.accountData.email,
            this.accountData.password,
            "unlogged",
          );
          return;
        }
        let [proxy, appId] = await Bot._prepareProxyAndAppId(dbVal);
        api = new DawnExtensionAPI(dbVal.authToken, proxy);
        appId = appId || (await this.processGetAppId(api));
        if (!appId) return;
        if (dbVal.sleepUntil) {
          slept = await delay(dbVal.sleepUntil);
          if (slept) return;
        }
        await api.keepalive(this.accountData.email, appId);
      } catch (err) {
        if (err instanceof APIError) {
          await this.handleApiError(err, i, maxAttempts, "keepalive", dbVal);
        } else {
          await this.handleGenericException(
            err,
            i,
            maxAttempts,
            "keepalive",
            dbVal,
          );
        }
      } finally {
        if ((slept === false || slept === null) && dbVal) {
          const next = Bot.getSleepUntil();
          await Accounts.updateAccount(dbVal.email, { sleepUntil: next });
        }
        if (api) await api.closeSession();
      }
    }
  }
}
