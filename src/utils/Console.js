import inquirer from "inquirer";
import figlet from "figlet";
import chalk from "chalk";
import Boxen from "boxen";
import { Table } from "console-table-printer";
import config from "./config.js";

export default class ConsoleManager {
  static MODULES = [
    "🆕 Register accounts",
    "🔍 Verify accounts",
    "🔑 Login accounts",
    "🌾 Farm accounts",
    "✅ Complete tasks",
    "📊 Export accounts statistics",
    new inquirer.Separator(),
    "🧹 Clean accounts proxies",
    "❌ Exit",
  ];

  static MODULES_DATA = {
    "🆕 Register accounts": "registration",
    "🔍 Verify accounts": "verify",
    "🔑 Login accounts": "login",
    "🌾 Farm accounts": "farm",
    "📊 Export accounts statistics": "export_stats",
    "✅ Complete tasks": "complete_tasks",
    "🧹 Clean accounts proxies": "clean_accounts_proxies",
    "❌ Exit": "exit",
  };

  clearScreen() {
    process.stdout.write("\x1B[2J\x1B[0f");
  }

  showDevInfo() {
    this.clearScreen();
    const title = figlet.textSync("JamBit", { horizontalLayout: "default" });
    console.log(chalk.cyan.bold(title));
    console.log(chalk.blue("VERSION: 2.0.0"));
    console.log(chalk.green("Channel: https://t.me/JamBitPY"));
    console.log(chalk.green("GitHub: https://github.com/Jaammerr"));
    console.log();
  }

  async getModule() {
    const answer = await inquirer.prompt([
      {
        type: "list",
        name: "module",
        message: chalk.gray("Select the module"),
        choices: ConsoleManager.MODULES,
      },
    ]);
    return answer.module;
  }

  displayInfo() {
    // Application Settings
    const appTable = new Table({
      title: chalk.yellow("Application Settings"),
      columns: [
        { name: "Parameter", alignment: "left", color: "cyan" },
        { name: "Value", alignment: "left", color: "magenta" },
      ],
    });
    const a = config.application_settings;
    appTable.addRow({ Parameter: "Threads", Value: a.threads });
    appTable.addRow({
      Parameter: "Keepalive Interval",
      Value: `${a.keepalive_interval} sec`,
    });
    appTable.addRow({ Parameter: "Database URL", Value: a.database_url });
    appTable.addRow({
      Parameter: "Skip Logged Accounts",
      Value: a.skip_logged_accounts,
    });
    appTable.addRow({
      Parameter: "Shuffle Accounts",
      Value: a.shuffle_accounts,
    });

    // Captcha Settings
    const cTable = new Table({
      title: chalk.yellow("Captcha Settings"),
      columns: [
        { name: "Parameter", alignment: "left", color: "cyan" },
        { name: "Value", alignment: "left", color: "magenta" },
      ],
    });
    const c = config.captcha_settings;
    cTable.addRow({ Parameter: "Service", Value: c.captcha_service });
    cTable.addRow({
      Parameter: "Max Solve Time",
      Value: `${c.max_captcha_solving_time} sec`,
    });

    // Redirect Settings
    const rTable = new Table({
      title: chalk.yellow("Redirect Settings"),
      columns: [
        { name: "Parameter", alignment: "left", color: "cyan" },
        { name: "Value", alignment: "left", color: "magenta" },
      ],
    });
    const r = config.redirect_settings;
    rTable.addRow({ Parameter: "Enabled", Value: r.enabled });
    rTable.addRow({ Parameter: "Email", Value: r.email });
    rTable.addRow({ Parameter: "IMAP Server", Value: r.imap_server });

    // IMAP Settings
    const iTable = new Table({
      title: chalk.yellow("IMAP Settings"),
      columns: [
        { name: "Parameter", alignment: "left", color: "cyan" },
        { name: "Value", alignment: "left", color: "magenta" },
      ],
    });
    const im = config.imap_settings;
    iTable.addRow({ Parameter: "Use Proxy", Value: im.use_proxy_for_imap });
    iTable.addRow({
      Parameter: "Single IMAP",
      Value: im.use_single_imap.enable,
    });
    iTable.addRow({
      Parameter: "Single Server",
      Value: im.use_single_imap.imap_server,
    });

    // Accounts Info
    const acTable = new Table({
      title: chalk.yellow("Files Information"),
      columns: [
        { name: "Parameter", alignment: "left", color: "cyan" },
        { name: "Value", alignment: "left", color: "magenta" },
      ],
    });
    acTable.addRow({
      Parameter: "To register",
      Value: config.accounts_to_register.length,
    });
    acTable.addRow({
      Parameter: "To farm",
      Value: config.accounts_to_farm.length,
    });
    acTable.addRow({
      Parameter: "To login",
      Value: config.accounts_to_login.length,
    });
    acTable.addRow({
      Parameter: "To export stats",
      Value: config.accounts_to_export_stats.length,
    });
    acTable.addRow({
      Parameter: "To complete tasks",
      Value: config.accounts_to_complete_tasks.length,
    });
    acTable.addRow({
      Parameter: "Referral codes",
      Value: config.referral_codes.length,
    });
    acTable.addRow({ Parameter: "Proxies", Value: config.proxies.length });

    // Combine into one box
    const combined = [
      appTable.render(),
      cTable.render(),
      rTable.render(),
      iTable.render(),
      acTable.render(),
    ].join("\n");
    console.log(
      Boxen(combined, {
        padding: 1,
        borderStyle: "round",
        borderColor: "green",
        title: chalk.inverse(" System Information "),
      }),
    );
  }

  async build() {
    this.showDevInfo();
    this.displayInfo();

    const choice = await this.getModule();
    const moduleKey = ConsoleManager.MODULES_DATA[choice];
    config.module = moduleKey;
    if (moduleKey === "exit") process.exit(0);
  }
}
