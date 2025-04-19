import fs from "fs/promises";
import path from "path";
import { createObjectCsvWriter } from "csv-writer";

class FileOperations {
  constructor(basePath = "./results") {
    this.basePath = basePath;
    this.lock = false;
    this.modulePaths = {
      register: {
        success: path.join(
          this.basePath,
          "registration",
          "registration_success.txt",
        ),
        failed: path.join(
          this.basePath,
          "registration",
          "registration_failed.txt",
        ),
      },
      tasks: {
        success: path.join(this.basePath, "tasks", "tasks_success.txt"),
        failed: path.join(this.basePath, "tasks", "tasks_failed.txt"),
      },
      stats: {
        base: path.join(this.basePath, "stats", "accounts_stats.csv"),
      },
      accounts: {
        unverified: path.join(
          this.basePath,
          "accounts",
          "unverified_accounts.txt",
        ),
        banned: path.join(this.basePath, "accounts", "banned_accounts.txt"),
        unregistered: path.join(
          this.basePath,
          "accounts",
          "unregistered_accounts.txt",
        ),
        unlogged: path.join(this.basePath, "accounts", "unlogged_accounts.txt"),
      },
      verify: {
        success: path.join(this.basePath, "re_verify", "verify_success.txt"),
        failed: path.join(this.basePath, "re_verify", "verify_failed.txt"),
      },
      login: {
        success: path.join(this.basePath, "login", "login_success.txt"),
        failed: path.join(this.basePath, "login", "login_failed.txt"),
      },
    };
  }

  async setupFiles() {
    await fs.mkdir(this.basePath, { recursive: true });

    for (const moduleName in this.modulePaths) {
      const modulePaths = this.modulePaths[moduleName];
      for (const pathKey in modulePaths) {
        const filePath = modulePaths[pathKey];
        const dir = path.dirname(filePath);
        await fs.mkdir(dir, { recursive: true });

        if (moduleName !== "stats") {
          await fs.open(filePath, "w");
        }
      }
    }
  }

  async setupStats() {
    await fs.mkdir(this.basePath, { recursive: true });

    for (const moduleName in this.modulePaths) {
      if (moduleName === "stats") {
        const timestamp = Math.floor(Date.now() / 1000);
        const filePath = this.modulePaths[moduleName].base;
        const newPath = path.join(
          path.dirname(filePath),
          `accounts_stats_${timestamp}.csv`,
        );
        this.modulePaths[moduleName].base = newPath;

        const csvWriter = createObjectCsvWriter({
          path: newPath,
          header: [
            { id: "email", title: "Email" },
            { id: "referralCode", title: "Referral Code" },
            { id: "points", title: "Points" },
            { id: "referralPoints", title: "Referral Points" },
            { id: "totalPoints", title: "Total Points" },
            { id: "registerDate", title: "Registration Date" },
            { id: "completedTasks", title: "Completed Tasks" },
          ],
        });

        await csvWriter.writeRecords([]); // Create an empty CSV file initially
      }
    }
  }

  async exportResult(result, module) {
    if (!(module in this.modulePaths)) {
      throw new Error(`Unknown module: ${module}`);
    }

    const filePath =
      this.modulePaths[module][result.status ? "success" : "failed"];

    await this.lockIfNeeded();

    try {
      const data = `${result.identifier}:${result.data}\n`;
      await fs.appendFile(filePath, data);
    } catch (error) {
      console.error(
        `Account: ${result.identifier} | Error writing to file: ${error}`,
      );
    } finally {
      this.unlockIfNeeded();
    }
  }

  async exportInvalidAccount(email, password, reason) {
    if (!(reason in this.modulePaths.accounts)) {
      throw new Error(`Unknown reason: ${reason}`);
    }

    const filePath = this.modulePaths.accounts[reason];

    await this.lockIfNeeded();

    try {
      const data = password ? `${email}:${password}\n` : `${email}\n`;
      await fs.appendFile(filePath, data);
    } catch (error) {
      console.error(`Account: ${email} | Error writing to file: ${error}`);
    } finally {
      this.unlockIfNeeded();
    }
  }

  async exportStats(data) {
    const filePath = this.modulePaths.stats.base;

    await this.lockIfNeeded();

    try {
      if (!data || !data.referralPoint || !data.rewardPoint) return;

      let taskPoints = 0;
      if (
        data.rewardPoint.twitter_x_id_points === 5000 &&
        data.rewardPoint.discordid_points === 5000 &&
        data.rewardPoint.telegramid_points === 5000
      ) {
        taskPoints = 15000;
      }

      const csvWriter = createObjectCsvWriter({
        path: filePath,
        append: true,
        header: [
          { id: "email", title: "Email" },
          { id: "referralCode", title: "Referral Code" },
          { id: "points", title: "Points" },
          { id: "commission", title: "Referral Points" },
          { id: "totalPoints", title: "Total Points" },
          { id: "registerDate", title: "Registration Date" },
          { id: "completedTasks", title: "Completed Tasks" },
        ],
      });

      await csvWriter.writeRecords([
        {
          email: data.referralPoint.email,
          referralCode: data.referralPoint.referralCode,
          points: data.rewardPoint.points,
          commission: data.referralPoint.commission,
          totalPoints:
            parseFloat(data.rewardPoint.points) +
            parseFloat(data.referralPoint.commission) +
            taskPoints,
          registerDate: data.rewardPoint.registerpointsdate,
          completedTasks: taskPoints === 15000,
        },
      ]);
    } catch (error) {
      console.error(`Error writing to file: ${error}`);
    } finally {
      this.unlockIfNeeded();
    }
  }

  async lockIfNeeded() {
    if (this.lock) {
      await new Promise((resolve) => setTimeout(resolve, 100)); // Simple delay
      await this.lockIfNeeded(); // Retry if still locked
    } else {
      this.lock = true;
    }
  }

  unlockIfNeeded() {
    this.lock = false;
  }
}

const fileOperations = new FileOperations();

export default fileOperations;
