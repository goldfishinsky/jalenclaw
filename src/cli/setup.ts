// src/cli/setup.ts
import inquirer from "inquirer";
import { writeFile, mkdir, access } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { stringify } from "yaml";

const CONFIG_DIR = join(homedir(), ".jalenclaw");
const CONFIG_PATH = join(CONFIG_DIR, "jalenclaw.yml");

export type AIProvider = "claude" | "openai" | "deepseek" | "ollama";
export type AuthMethod = "oauth" | "apikey";
export type Channel = "none" | "whatsapp" | "telegram" | "slack" | "discord";

export interface SetupAnswers {
  provider: AIProvider;
  authMethod?: AuthMethod;
  apiKey?: string;
  channel: Channel;
  telegramToken?: string;
  port: number;
}

/**
 * Check whether the JalenClaw config file already exists.
 */
export async function checkConfigExists(
  configPath: string = CONFIG_PATH,
): Promise<boolean> {
  try {
    await access(configPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Build a jalenclaw.yml config object from the setup wizard answers.
 */
export function buildConfig(answers: SetupAnswers): Record<string, unknown> {
  const config: Record<string, unknown> = {
    gateway: {
      host: "127.0.0.1",
      port: answers.port,
    },
    models: {
      default: answers.provider,
      providers: buildProviderConfig(answers),
    },
    channels: buildChannelConfig(answers),
  };

  return config;
}

function buildProviderConfig(
  answers: SetupAnswers,
): Record<string, unknown> {
  const providers: Record<string, unknown> = {};

  switch (answers.provider) {
    case "claude":
      if (answers.authMethod === "oauth") {
        providers.claude = { authType: "oauth" };
      } else {
        providers.claude = {
          authType: "apikey",
          apiKey: answers.apiKey ?? "${ANTHROPIC_API_KEY}",
        };
      }
      break;
    case "openai":
      providers.openai = {
        authType: "apikey",
        apiKey: answers.apiKey ?? "${OPENAI_API_KEY}",
      };
      break;
    case "deepseek":
      providers.deepseek = {
        authType: "apikey",
        apiKey: answers.apiKey ?? "${DEEPSEEK_API_KEY}",
      };
      break;
    case "ollama":
      providers.ollama = {
        baseUrl: "http://localhost:11434",
      };
      break;
  }

  return providers;
}

function buildChannelConfig(
  answers: SetupAnswers,
): Record<string, unknown> {
  const channels: Record<string, unknown> = {};

  if (answers.channel === "none") {
    return channels;
  }

  const channelEntry: Record<string, unknown> = { enabled: true };

  if (answers.channel === "telegram" && answers.telegramToken) {
    channelEntry.token = answers.telegramToken;
  }

  channels[answers.channel] = channelEntry;
  return channels;
}

/**
 * Write the config YAML to disk.
 */
export async function writeConfig(
  config: Record<string, unknown>,
  configDir: string = CONFIG_DIR,
  configPath: string = CONFIG_PATH,
): Promise<void> {
  await mkdir(configDir, { recursive: true });
  const yamlContent = stringify(config);
  await writeFile(configPath, yamlContent, "utf-8");
}

/**
 * Run the interactive first-run setup wizard.
 * Accepts an optional `promptFn` for testing (defaults to inquirer.prompt).
 */
export async function runSetupWizard(options?: {
  configDir?: string;
  configPath?: string;
  promptFn?: typeof inquirer.prompt;
  onOAuthLogin?: () => Promise<void>;
}): Promise<void> {
  const configDir = options?.configDir ?? CONFIG_DIR;
  const configPath = options?.configPath ?? CONFIG_PATH;
  const prompt = options?.promptFn ?? inquirer.prompt;

  console.log("");
  console.log("\u{1F43E} Welcome to JalenClaw!");
  console.log("");
  console.log("Let's get you set up.");
  console.log("");

  // 1. Choose AI provider
  const { provider } = await prompt<{ provider: AIProvider }>([
    {
      type: "list",
      name: "provider",
      message: "Choose your AI provider:",
      choices: [
        { name: "Claude (Anthropic) \u2014 supports API Key and subscription", value: "claude" },
        { name: "OpenAI (GPT-4o)", value: "openai" },
        { name: "DeepSeek", value: "deepseek" },
        { name: "Ollama (local models)", value: "ollama" },
      ],
    },
  ]);

  let authMethod: AuthMethod | undefined;
  let apiKey: string | undefined;

  // 2. Authentication method (provider-dependent)
  if (provider === "claude") {
    const authAnswer = await prompt<{ authMethod: AuthMethod }>([
      {
        type: "list",
        name: "authMethod",
        message: "Authentication method:",
        choices: [
          { name: "OAuth login (use your Claude subscription)", value: "oauth" },
          { name: "API Key", value: "apikey" },
        ],
      },
    ]);
    authMethod = authAnswer.authMethod;

    if (authMethod === "apikey") {
      const keyAnswer = await prompt<{ apiKey: string }>([
        {
          type: "password",
          name: "apiKey",
          message: "Enter your Anthropic API key:",
          mask: "*",
          validate: (input: string) =>
            input.length > 0 ? true : "API key cannot be empty",
        },
      ]);
      apiKey = keyAnswer.apiKey;
    }
  } else if (provider === "openai" || provider === "deepseek") {
    const keyAnswer = await prompt<{ apiKey: string }>([
      {
        type: "password",
        name: "apiKey",
        message: `Enter your ${provider === "openai" ? "OpenAI" : "DeepSeek"} API key:`,
        mask: "*",
        validate: (input: string) =>
          input.length > 0 ? true : "API key cannot be empty",
      },
    ]);
    apiKey = keyAnswer.apiKey;
  }

  // 3. Messaging channel
  const { channel } = await prompt<{ channel: Channel }>([
    {
      type: "list",
      name: "channel",
      message: "Enable a messaging channel?",
      choices: [
        { name: "None (WebChat only)", value: "none" },
        { name: "WhatsApp", value: "whatsapp" },
        { name: "Telegram", value: "telegram" },
        { name: "Slack", value: "slack" },
        { name: "Discord", value: "discord" },
      ],
    },
  ]);

  let telegramToken: string | undefined;

  if (channel === "telegram") {
    const tokenAnswer = await prompt<{ telegramToken: string }>([
      {
        type: "password",
        name: "telegramToken",
        message: "Enter your Telegram bot token:",
        mask: "*",
        validate: (input: string) =>
          input.length > 0 ? true : "Token cannot be empty",
      },
    ]);
    telegramToken = tokenAnswer.telegramToken;
  }

  if (channel === "whatsapp") {
    console.log("\n\u{2139}\uFE0F  WhatsApp will be configured on first connection.\n");
  }

  // 4. Gateway port
  const { port } = await prompt<{ port: number }>([
    {
      type: "number",
      name: "port",
      message: "Gateway port:",
      default: 18900,
      validate: (input: number) => {
        if (isNaN(input) || input < 1 || input > 65535) {
          return "Port must be between 1 and 65535";
        }
        return true;
      },
    },
  ]);

  const answers: SetupAnswers = {
    provider,
    authMethod,
    apiKey,
    channel,
    telegramToken,
    port,
  };

  // 5. Build and write config
  const config = buildConfig(answers);
  await writeConfig(config, configDir, configPath);

  console.log("");
  console.log(`\u2705 Configuration saved to ${configPath}`);

  // 6. If OAuth, trigger login flow
  if (provider === "claude" && authMethod === "oauth") {
    console.log("");
    console.log("\u{1F510} Launching OAuth login...");
    if (options?.onOAuthLogin) {
      await options.onOAuthLogin();
    } else {
      // Dynamic import to avoid circular dependency issues
      const { execSync } = await import("node:child_process");
      try {
        execSync("node ./dist/index.js auth login", {
          stdio: "inherit",
          cwd: process.cwd(),
        });
      } catch {
        console.log("\u26A0\uFE0F  OAuth login skipped. Run 'jalenclaw auth login' later.");
      }
    }
  }

  console.log("\u{1F680} Starting JalenClaw...");
  console.log("");
}
