// src/cli/setup.ts
import { select, password, number } from "@inquirer/prompts";
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

export function buildConfig(answers: SetupAnswers): Record<string, unknown> {
  return {
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

  if (answers.channel === "none") return channels;

  const channelEntry: Record<string, unknown> = { enabled: true };

  if (answers.channel === "telegram" && answers.telegramToken) {
    channelEntry.token = answers.telegramToken;
  }

  channels[answers.channel] = channelEntry;
  return channels;
}

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
 */
export async function runSetupWizard(options?: {
  configDir?: string;
  configPath?: string;
  collectAnswers?: () => Promise<SetupAnswers>;
  onOAuthLogin?: () => Promise<boolean>;
}): Promise<void> {
  const configDir = options?.configDir ?? CONFIG_DIR;
  const configPath = options?.configPath ?? CONFIG_PATH;

  console.log("");
  console.log("\u{1F43E} Welcome to JalenClaw!");
  console.log("");
  console.log("Let's get you set up.");
  console.log("");

  if (options?.collectAnswers) {
    // Test mode: collect all answers at once
    const answers = await options.collectAnswers();
    const config = buildConfig(answers);
    await writeConfig(config, configDir, configPath);
    if (answers.provider === "claude" && answers.authMethod === "oauth" && options.onOAuthLogin) {
      await options.onOAuthLogin();
    }
    console.log(`\u2705 Configuration saved to ${configPath}`);
    console.log("\u{1F680} Starting JalenClaw...\n");
    return;
  }

  // Interactive mode: step by step, authenticate before continuing

  // Step 1: Choose provider
  const provider = await select<AIProvider>({
    message: "Choose your AI provider:",
    choices: [
      { name: "Claude (Anthropic) \u2014 supports API Key and subscription", value: "claude" },
      { name: "OpenAI (GPT-4o)", value: "openai" },
      { name: "DeepSeek", value: "deepseek" },
      { name: "Ollama (local models)", value: "ollama" },
    ],
  });

  // Step 2: Authenticate immediately
  let authMethod: AuthMethod | undefined;
  let apiKey: string | undefined;

  if (provider === "claude") {
    authMethod = await select<AuthMethod>({
      message: "Authentication method:",
      choices: [
        { name: "OAuth login (use your Claude subscription)", value: "oauth" },
        { name: "API Key", value: "apikey" },
      ],
    });

    if (authMethod === "oauth") {
      console.log("\n\u{1F510} Starting Claude OAuth login...\n");
      const success = await doOAuthLogin(options?.onOAuthLogin);
      if (!success) {
        console.log("\n\u274C OAuth login failed.");
        console.log("Please try again or use an API key instead.\n");
        process.exit(1);
      }
      console.log("\u2705 Authentication successful!\n");
    } else {
      apiKey = await password({
        message: "Enter your Anthropic API key:",
        mask: "*",
        validate: (val) => (val.length > 0 ? true : "API key cannot be empty"),
      });
    }
  } else if (provider === "openai" || provider === "deepseek") {
    apiKey = await password({
      message: `Enter your ${provider === "openai" ? "OpenAI" : "DeepSeek"} API key:`,
      mask: "*",
      validate: (val) => (val.length > 0 ? true : "API key cannot be empty"),
    });
  }
  // Ollama needs no auth

  // Step 3: Channel (only after auth succeeds)
  const channel = await select<Channel>({
    message: "Enable a messaging channel?",
    choices: [
      { name: "None (WebChat only)", value: "none" },
      { name: "WhatsApp", value: "whatsapp" },
      { name: "Telegram", value: "telegram" },
      { name: "Slack", value: "slack" },
      { name: "Discord", value: "discord" },
    ],
  });

  let telegramToken: string | undefined;
  if (channel === "telegram") {
    telegramToken = await password({
      message: "Enter your Telegram bot token:",
      mask: "*",
      validate: (val) => (val.length > 0 ? true : "Token cannot be empty"),
    });
  }
  if (channel === "whatsapp") {
    console.log("\n\u2139\uFE0F  WhatsApp will be configured on first connection.\n");
  }

  // Step 4: Port
  const port = await number({
    message: "Gateway port:",
    default: 18900,
    validate: (val) => {
      if (val === undefined || isNaN(val) || val < 1 || val > 65535) {
        return "Port must be between 1 and 65535";
      }
      return true;
    },
  }) ?? 18900;

  // Save config
  const answers: SetupAnswers = { provider, authMethod, apiKey, channel, telegramToken, port };
  const config = buildConfig(answers);
  await writeConfig(config, configDir, configPath);

  console.log(`\n\u2705 Configuration saved to ${configPath}`);
  console.log("\u{1F680} Starting JalenClaw...\n");
}

async function doOAuthLogin(mockLogin?: () => Promise<boolean>): Promise<boolean> {
  if (mockLogin) return mockLogin();

  const { oauthLoginFlow } = await import("./auth.js");
  const result = await oauthLoginFlow();
  if (!result.success) {
    console.log(result.message);
    return false;
  }

  console.log(result.message);
  return true;
}
