import chalk from "chalk";

export function printError(message: string): void {
  console.error(chalk.red(`error: ${message}`));
}

export function printWarn(message: string): void {
  console.error(chalk.yellow(`warn: ${message}`));
}

export function printInfo(message: string): void {
  console.log(chalk.cyan(message));
}

export function exitWithError(message: string, code = 1): never {
  printError(message);
  process.exit(code);
}
