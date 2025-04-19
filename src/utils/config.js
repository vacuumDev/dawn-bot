import fs from "fs/promises";
import path from "path";

export class ConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ConfigurationError";
  }
}

export class ConfigLoader {
  static REQUIRED_PARAMS = new Set([
    "application_settings",
    "attempts_and_delay_settings",
    "redirect_settings",
    "imap_settings",
    "captcha_settings",
  ]);

  constructor(basePath = process.cwd()) {
    this.basePath = path.resolve(basePath);
    this.settingsPath = path.join(this.basePath, "config.json");
    this.dataPath = path.join(this.basePath, "config", "data");
  }

  // Читает JSON-конфиг
  async _loadJson() {
    try {
      const raw = await fs.readFile(this.settingsPath, "utf-8");
      const cfg = JSON.parse(raw);
      const missing = [...ConfigLoader.REQUIRED_PARAMS].filter(
        (k) => !(k in cfg),
      );
      if (missing.length) {
        throw new ConfigurationError(
          `Missing required fields: ${missing.join(", ")}`,
        );
      }
      return cfg;
    } catch (err) {
      if (err instanceof SyntaxError) {
        throw new ConfigurationError(`Invalid JSON format: ${err.message}`);
      }
      throw new ConfigurationError(
        `Failed to load config.json: ${err.message}`,
      );
    }
  }

  // Чтение текстового файла (для аккаунтов и реф. кодов)
  async _readLines(filePath, { allowEmpty = false } = {}) {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const lines = content
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l);
      if (!allowEmpty && lines.length === 0) {
        throw new ConfigurationError(`File is empty: ${filePath}`);
      }
      return lines;
    } catch (err) {
      if (err.code === "ENOENT") {
        // Если файла нет и allowEmpty, возвращаем пустой массив
        if (allowEmpty) return [];
        throw new ConfigurationError(`File not found: ${filePath}`);
      }
      throw new ConfigurationError(
        `Failed to read ${filePath}: ${err.message}`,
      );
    }
  }

  // Парсинг аккаунтов
  async _parseAccounts(filename, mode) {
    const file = path.join(this.dataPath, filename);
    const lines = await this._readLines(file, { allowEmpty: true });
    const accounts = [];

    for (const line of lines) {
      const parts = line.split(":").map((p) => p.trim());
      if (
        ["login_accounts", "register_accounts", "verify_accounts"].includes(
          mode,
        )
      ) {
        if (parts.length !== 2) {
          throw new ConfigurationError(
            `Invalid account format (${filename}): ${line}`,
          );
        }
        accounts.push({ email: parts[0], password: parts[1] });
      } else {
        // default_accounts
        if (parts.length === 2) {
          accounts.push({ email: parts[0], password: parts[1] });
        } else {
          accounts.push({ email: parts[0], password: "" });
        }
      }
    }
    return accounts;
  }

  // Парсинг реферальных кодов
  async _parseReferralCodes() {
    const file = path.join(this.dataPath, "referral_codes.txt");
    return await this._readLines(file, { allowEmpty: true });
  }

  // Проверка доменов IMAP
  static validateDomains(accounts, domains) {
    for (const acc of accounts) {
      const domain = acc.email.split("@")[1];
      if (!domains[domain]) {
        throw new ConfigurationError(`Domain '${domain}' not supported`);
      }
      acc.imap_server = domains[domain];
    }
  }

  // Назначение одного IMAP для всех
  static assignImapServer(accounts, server) {
    for (const acc of accounts) {
      acc.imap_server = server;
    }
  }

  // Основная загрузка конфигурации
  async load() {
    // 1) JSON-конфиг
    const params = await this._loadJson();

    // 2) Прокси из config.json
    // Если указан proxy_url, используем его
    const proxyUrl = params.application_settings.proxy_url;
    const proxies = proxyUrl ? [proxyUrl] : [];

    // 3) Аккаунты
    const accountsToFarm = await this._parseAccounts(
      "farm_accounts.txt",
      "default_accounts",
    );
    const accountsToExport = await this._parseAccounts(
      "export_stats_accounts.txt",
      "default_accounts",
    );
    const accountsToComplete = await this._parseAccounts(
      "complete_tasks_accounts.txt",
      "default_accounts",
    );
    const accountsToRegister = await this._parseAccounts(
      "register_accounts.txt",
      "register_accounts",
    );
    const accountsToLogin = await this._parseAccounts(
      "login_accounts.txt",
      "login_accounts",
    );
    const accountsToVerify = await this._parseAccounts(
      "verify_accounts.txt",
      "verify_accounts",
    );
    const referralCodes = await this._parseReferralCodes();

    if (
      ![
        accountsToFarm,
        accountsToExport,
        accountsToComplete,
        accountsToRegister,
        accountsToLogin,
        accountsToVerify,
      ].some((arr) => arr.length > 0)
    ) {
      throw new ConfigurationError("No accounts found in data files");
    }

    // 4) IMAP-настройки
    const imapSettings = params.imap_settings;
    const useSingle = imapSettings.use_single_imap.enable;
    const singleServer = imapSettings.use_single_imap.imap_server;
    const domains = imapSettings.servers;

    if ((accountsToRegister.length || accountsToVerify.length) && !useSingle) {
      if (accountsToRegister.length)
        ConfigLoader.validateDomains(accountsToRegister, domains);
      if (accountsToVerify.length)
        ConfigLoader.validateDomains(accountsToVerify, domains);
    } else {
      if (accountsToRegister.length)
        ConfigLoader.assignImapServer(accountsToRegister, singleServer);
      if (accountsToVerify.length)
        ConfigLoader.assignImapServer(accountsToVerify, singleServer);
    }

    // 5) Итоговый объект
    return {
      ...params,
      proxyUrl,
      referral_codes: referralCodes,
      accounts_to_farm: accountsToFarm,
      accounts_to_export_stats: accountsToExport,
      accounts_to_complete_tasks: accountsToComplete,
      accounts_to_register: accountsToRegister,
      accounts_to_login: accountsToLogin,
      accounts_to_verify: accountsToVerify,
    };
  }
}

/**
 * Функция для быстрой загрузки конфигурации:
 * import loadConfig from './configLoader.js';
 * const config = await loadConfig();
 */
async function loadConfig() {
  const loader = new ConfigLoader();
  try {
    return await loader.load();
  } catch (err) {
    console.error(`Configuration loading failed: ${err.message}`);
    process.exit(1);
  }
}

const config = await loadConfig();

export default config;
