import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export default class Accounts {
  /** Получить один аккаунт по email */
  static async getAccount(email) {
    return prisma.account.findUnique({ where: { email } });
  }

  /** Получить все аккаунты */
  static async getAccounts() {
    return prisma.account.findMany();
  }

  /** Обновить proxy для аккаунта */
  static async updateAccountProxy(email, proxy) {
    return prisma.account.update({
      where: { email },
      data: { activeAccountProxy: proxy },
    });
  }

  /** Получить proxy аккаунта или пустую строку */
  static async getAccountProxy(email) {
    const acc = await this.getAccount(email);
    return acc?.activeAccountProxy || "";
  }

  /** Создать или обновить аккаунт */
  static async createOrUpdateAccount({
    email,
    password,
    appId,
    authToken,
    proxy,
  }) {
    return prisma.account.upsert({
      where: { email },
      create: {
        email,
        password: password || null,
        appId: appId || null,
        authToken: authToken || null,
        activeAccountProxy: proxy || null,
      },
      update: {
        ...(password !== undefined && { password }),
        ...(appId !== undefined && { appId }),
        ...(authToken !== undefined && { authToken }),
        ...(proxy !== undefined && { activeAccountProxy: proxy }),
      },
    });
  }

  /** Обновить поля аккаунта */
  static async updateAccount(email, { password, appId, authToken, proxy }) {
    return prisma.account.update({
      where: { email },
      data: {
        ...(password !== undefined && { password }),
        ...(appId !== undefined && { appId }),
        ...(authToken !== undefined && { authToken }),
        ...(proxy !== undefined && { activeAccountProxy: proxy }),
      },
    });
  }

  /** Получить appId по email или null */
  static async getAppId(email) {
    const acc = await this.getAccount(email);
    return acc?.appId || null;
  }

  /** Получить authToken по email или null */
  static async getAuthToken(email) {
    const acc = await this.getAccount(email);
    return acc?.authToken || null;
  }

  /** Удалить аккаунт, вернуть true если удалён */
  static async deleteAccount(email) {
    const result = await prisma.account.deleteMany({ where: { email } });
    return result.count > 0;
  }

  /** Установить время сна (UTC) для аккаунта */
  static async setSleepUntil(email, sleepUntil) {
    if (!(sleepUntil instanceof Date)) {
      throw new Error("sleepUntil must be a JavaScript Date");
    }
    // Prisma сохраняет Date в UTC автоматически
    return prisma.account.update({
      where: { email },
      data: { sleepUntil },
    });
  }

  /** Очистить proxy у всех аккаунтов, вернуть число сброшенных */
  static async clearAllAccountsProxies() {
    const result = await prisma.account.updateMany({
      where: { activeAccountProxy: { not: null } },
      data: { activeAccountProxy: null },
    });
    return result.count;
  }
}
