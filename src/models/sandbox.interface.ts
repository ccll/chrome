import { LaunchOptions } from 'puppeteer';

export interface ISandboxOpts {
  builtin: string[];
  external: boolean | string[];
  root: string;
}
export interface IConfig {
  timeout: number;
  opts?: LaunchOptions;
}

export interface IMessage {
  event: string;
  context?: any;
  error?: string;
}
