import Imap from "imap";
import axios from "axios";

class EmailHandler {
  /**
   * Retrieves a new refresh token from Microsoft using the given refresh token.
   * Implementation mirrors the `getRefreshTokenHotmail` function.
   *
   * @param {string} currentRefreshToken The current refresh token.
   * @param {string} clientId The Client ID (App ID) for your Microsoft OAuth.
   * @returns {Promise<string|null>} The new access token, or null if unsuccessful.
   */
  static async getRefreshTokenHotmail(currentRefreshToken, clientId) {
    let refreshToken = null;
    const url = "https://login.microsoftonline.com/common/oauth2/v2.0/token";

    const axiosConfig = {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    };

    // First attempt (no scope).
    const postData = new URLSearchParams();
    postData.append("client_id", clientId);
    postData.append("refresh_token", currentRefreshToken);
    postData.append("grant_type", "refresh_token");

    try {
      const response = await axios.post(url, postData, axiosConfig);
      refreshToken = response.data.access_token;
    } catch (error) {
      console.error(`Error during first token request: ${error}`);

      // Second attempt with scope appended.
      try {
        const postData2 = new URLSearchParams();
        postData2.append("client_id", clientId);
        postData2.append("refresh_token", currentRefreshToken);
        postData2.append("grant_type", "refresh_token");
        postData2.append(
          "scope",
          "https://outlook.office.com/IMAP.AccessAsUser.All",
        );

        const response2 = await axios.post(url, postData2, axiosConfig);
        refreshToken = response2.data.access_token;
        console.debug(
          `Access token retrieved on second attempt: ${refreshToken}`,
        );
      } catch (error2) {
        console.error(`Error during second token request: ${error2}`);
      }
    }
    return refreshToken;
  }

  /**
   * Connects via IMAP using OAuth, searches all mailboxes for an OTP code that
   * appears *after* a given timestamp, using the regex
   *
   * Logic is the same as your original `fetchOtpFromEmail` method.
   *
   * @param {string} email The full email address (e.g. test@hotmail.com).
   * @param {string} currentRefreshToken The current MS refresh token.
   * @param {string} clientId The MS OAuth Client ID.
   * @param {RegExp[]} regexes The MS OAuth Client ID.
   * @param {number} timestamp Only fetch OTP messages after this timestamp (ms).
   * @returns {Promise<string|null>} The first matching OTP code found, or null if not found.
   */
  static async fetchOtpFromEmail(
    email,
    currentRefreshToken,
    clientId,
    regexes,
    timestamp,
  ) {
    // Определяем хост в зависимости от домена.
    let host = "outlook.office365.com";
    const lowerEmail = email.toLowerCase();
    if (
      lowerEmail.includes("outlook.com") ||
      lowerEmail.includes("hotmail.com") ||
      lowerEmail.includes("live.com")
    ) {
      host = "outlook.office365.com";
    }

    // Получаем токен доступа по refresh-токену.
    const token = await EmailHandler.getRefreshTokenHotmail(
      currentRefreshToken,
      clientId,
    );

    // Формируем xoauth2 строку.
    const base64Encoded = Buffer.from(
      [`user=${email}`, `auth=Bearer ${token}`, "", ""].join("\x01"),
      "utf-8",
    ).toString("base64");

    // Настройки подключения IMAP.
    const imapConfig = {
      xoauth2: base64Encoded,
      host: host,
      port: 993,
      tls: true,
      authTimeout: 25000,
      connTimeout: 30000,
      tlsOptions: {
        rejectUnauthorized: false,
        servername: host,
      },
    };

    return new Promise((resolve, reject) => {
      const imap = new Imap(imapConfig);
      let latestDate = timestamp; // Будем учитывать сообщения новее этого времени.
      let latestOtp = null;

      // Если по истечении 4 минут OTP не найден, возвращаем ошибку.
      setTimeout(() => {
        imap.end();
        reject(new Error("OTP can not be found"));
      }, 60_000);

      // Функция для обработки выборки сообщений с поиском OTP.
      function processFetchedMessages(results, callback) {
        if (!results || !results.length) {
          return callback();
        }
        const fetcher = imap.fetch(results, { bodies: "" });
        fetcher.on("message", (msg, seqno) => {
          let buffer = "";
          msg.on("body", (stream) => {
            stream.on("data", (chunk) => {
              buffer += chunk.toString("utf8");
            });
            stream.once("end", () =>
            {
              buffer = buffer.replaceAll("3D", "").replaceAll("=\r\n", "");
              const header = Imap.parseHeader(buffer);
              // Проверяем дату сообщения – пропускаем, если оно старее указанного timestamp.
              const msgDate = new Date(header.date?.[0] || 0).getTime();
              if (!msgDate || msgDate < timestamp) return;
              // Ищем OTP с помощью регулярного выражения.
              for (const regex of regexes) {
                const match = buffer.match(regex);
                if (match && msgDate > latestDate) {
                  latestDate = msgDate;
                  latestOtp = match[0].split('"')[0];
                  console.log(`Найден OTP [${latestOtp}] от ${header.date}`);
                }
              }
            });
          });
          msg.once("error", (msgErr) => {
            console.error(`Ошибка при обработке сообщения ${seqno}:`, msgErr);
          });
        });
        fetcher.once("error", (fetchErr) => {
          console.error("Ошибка выборки:", fetchErr);
        });
        fetcher.once("end", callback);
      }

      imap.once("ready", () => {
        // Открываем маилбокс "Junk"
        imap.openBox("Junk", true, (err, box) => {
          if (err) {
            imap.end();
            return reject(err);
          }
          // Ищем все существующие сообщения в Junk
          imap.search(["ALL"], (searchErr, results) => {
            if (searchErr) {
              console.error("Ошибка поиска в Junk:", searchErr);
            }
            processFetchedMessages(results, () => {
              if (latestOtp) {
                imap.end();
                return resolve(latestOtp);
              }
              // Если OTP не найден в уже имеющихся письмах,
              // устанавливаем слушатель на событие прихода новых сообщений.
              console.log(
                "OTP не найден в существующих сообщениях, ожидаем новые письма в папке Junk...",
              );

              imap.on("mail", (numNewMsgs) => {
                console.log(`Пришло ${numNewMsgs} новых сообщений в Junk.`);
                // Ищем только непрочитанные сообщения
                imap.search(["UNSEEN"], (newSearchErr, newResults) => {
                  if (newSearchErr) {
                    console.error(
                      "Ошибка поиска новых сообщений:",
                      newSearchErr,
                    );
                    return;
                  }
                  processFetchedMessages(newResults, () => {
                    if (latestOtp) {
                      imap.end();
                      return resolve(latestOtp);
                    }
                  });
                });
              });
            });
          });
        });
      });

      imap.once("error", (imapErr) => {
        reject(imapErr);
      });

      imap.once("end", () => {
        console.log("IMAP-соединение закрыто");
        if (!latestOtp) resolve(null);
      });

      imap.connect();
    });
  }
}

export class EmailValidator {
  constructor(imapServer, email, password) {
    this.imapServer = imapServer;
    this.email = email;
    this.password = password;
  }

  async validate(proxy = null) {
    // Reuse IMAP config from EmailHandler
    try {
      await EmailHandler.fetchOtpFromEmail(
          this.email,
          '', // no refresh token
          '',
          /()/,
          0
      );
      return { status: true, identifier: this.email, data: `Valid:${new Date()}` };
    } catch (err) {
      if (err.message.includes('Authentication failed')) {
        return { status: false, identifier: this.email, data: 'Invalid credentials' };
      }
      return { status: false, identifier: this.email, data: `validation failed: ${err.message}` };
    }
  }
}

// ===== LinkCache =====
class LinkCache {
  constructor() { this._used = {}; }
  isLinkUsed(link) { return !!this._used[link]; }
  addLink(email, link) { this._used[link] = email; }
}

// ===== LinkExtractor =====
export class LinkExtractor {
  static cache = new LinkCache();

  constructor(imapServer, email, password, options = {}) {
    this.imapServer = imapServer;
    this.email = email;
    this.password = password;
    this.maxAttempts = options.maxAttempts || 8;
    this.delay = options.delay || 5;
    this.redirectEmail = options.redirectEmail || null;
    this.patterns = options.patterns || [
      /https:\/\/www\.aeropres\.in\/chromeapi\/dawn\/v1\/userverify\/verifyconfirm\?key=[^\s]+/,
      /https?:\/\/webmail\.online\/go\.php\?r=[^\s]+/,
      /https?:\/\/u\d+\.ct\.sendgrid\.net\/ls\/click\?upn=[^\s]+/
    ];
  }

  async extractLink(proxy = null) {
    for (let i = 0; i < this.maxAttempts; i++) {
      const link = await this._searchInFolders(proxy);
      if (link) {
        return { status: true, identifier: this.email, data: link };
      }
      console.info(`Retry ${i+1}/${this.maxAttempts} in ${this.delay}s`);
      await new Promise(r => setTimeout(r, this.delay*1000));
    }
    console.error(`Max attempts reached for ${this.email}`);
    return { status: false, identifier: this.email, data: 'Max attempts reached' };
  }

  async _searchInFolders(proxy) {
    // Simplified: only Inbox
    return new Promise((resolve) => {
      const config = {
        user: this.email,
        password: this.password,
        host: this.imapServer,
        port: 993,
        tls: true
      };
      // attach proxy socket if provided (similar to OTP)
      if (proxy) {
        // ... omitted for brevity
      }
      const imap = new Imap(config);
      imap.once('ready', () => {
        imap.openBox('INBOX', true, (err, box) => {
          if (err) { imap.end(); return resolve(null); }
          imap.search(['ALL'], (e, results) => {
            const f = imap.fetch(results, { bodies: '' });
            let found = null;
            f.on('message', (msg) => {
              let buf = '';
              msg.on('body', (stream) => stream.on('data', c => buf += c.toString()));
              msg.once('end', () => {
                const matches = this.patterns.map(p => buf.match(p)).filter(m => m);
                if (matches.length) {
                  const link = matches[0][1] || matches[0][0];
                  if (!LinkExtractor.cache.isLinkUsed(link)) {
                    LinkExtractor.cache.addLink(this.email, link);
                    found = link;
                  }
                }
              });
            });
            f.once('end', () => { imap.end(); resolve(found); });
          });
        });
      });
      imap.once('error', () => resolve(null));
      imap.connect();
    });
  }
}


export default EmailHandler;
