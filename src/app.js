import config from "./utils/config.js";
import fileOperations from "./utils/file_utils.js";
import ModuleExecutor from "./core/modules/executor.js";
import Accounts from "./core/database/Accounts.js";
import consoleManager from "./utils/Console.js";

// Инициализация базы данных и файлов
async function initializeApp() {
  console.info("Database initialized");
  await fileOperations.setupFiles();
}

// Очистка прокси у всех аккаунтов
async function cleanAccountsProxies() {
  console.info("Cleaning proxies for all accounts...");
  try {
    const count = await Accounts.clearAllAccountsProxies();
    console.info(`Cleared proxies for ${count} accounts`);
  } catch (err) {
    console.error(`Error clearing proxies: ${err.message}`);
  }
}

// Последовательная обработка списка аккаунтов для заданного модуля
async function executeModuleForAccounts(accounts, moduleName) {
  if (moduleName === "export_stats") {
    await fileOperations.setupStats();
  }

  for (const account of accounts) {
    console.info(`Processing ${moduleName} for ${account.email}`);
    try {
      const executor = new ModuleExecutor(account);
      const fn = executor[`_process_${moduleName}`];
      if (typeof fn === "function") {
        await fn.call(executor);
      } else {
        console.warn(`Method _process_${moduleName} not found on executor`);
      }
    } catch (err) {
      console.error(`Error on ${account.email}: ${err.message}`);
    }
  }
}

// Постоянный цикл для модуля farm
async function farmContinuously(accounts) {
  while (true) {
    if (config.application_settings.shuffle_accounts) {
      accounts.sort(() => Math.random() - 0.5);
    }
    await executeModuleForAccounts(accounts, "farm");
    // Ждём 5 секунд перед новой итерацией
    await new Promise((r) => setTimeout(r, 5000));
  }
}

// Ожидание нажатия Enter
function waitEnter() {
  return new Promise((resolve) => {
    import("readline").then(({ createInterface }) => {
      const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      rl.question("\nPress Enter to continue...", () => {
        rl.close();
        resolve();
      });
    });
  });
}

// Запуск приложения
async function run() {
  await initializeApp();

  const modules = {
    registration: config.accounts_to_register,
    login: config.accounts_to_login,
    farm: config.accounts_to_farm,
    complete_tasks: config.accounts_to_complete_tasks,
    export_stats: config.accounts_to_export_stats,
    verify: config.accounts_to_verify,
  };

  while (true) {
    await consoleManager.build();

    if (config.module === "clean_accounts_proxies") {
      await cleanAccountsProxies();
      await waitEnter();
      continue;
    }

    const accounts = modules[config.module];
    if (!accounts) {
      console.error(`Unknown module: ${config.module}`);
      break;
    }

    if (accounts.length === 0) {
      console.error(`No accounts configured for ${config.module}`);
      await waitEnter();
      continue;
    }

    if (config.module === "farm") {
      await farmContinuously(accounts);
    } else {
      await executeModuleForAccounts(accounts, config.module);
      await waitEnter();
    }
  }
}

run().catch((err) => console.error(`Application error: ${err.message}`));
