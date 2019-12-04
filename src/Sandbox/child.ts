import * as _ from 'lodash';
import * as puppeteer from 'puppeteer';
import { NodeVM } from 'vm2';

import { ILaunchOptions, launchChrome, IBrowser } from '../chrome-helper';
import { IMessage } from '../models/sandbox.interface';
import { ISandboxOpts } from '../models/sandbox.interface';
import { getDebug } from '../utils';

const debug = getDebug('sandbox');
type consoleMethods = 'log' | 'warn' | 'debug' | 'table' | 'info';
let browserLaunching: Promise<IBrowser>;

const send = (msg: IMessage) => {
  debug(`Sending parent message: ${JSON.stringify(msg)}`);

  if (process.send) {
    return process.send(msg);
  }

  throw new Error('Not running in a child process, closing');
};

const buildBrowserSandbox = (page: puppeteer.Page): { console: any } => {
  debug(`Generating sandbox console`);

  return {
    console: _.reduce(_.keys(console), (browserConsole: any, consoleMethod: consoleMethods) => {
      browserConsole[consoleMethod] = (...args: any[]) => {
        args.unshift(consoleMethod);
        return page.evaluate((...args: [consoleMethods, any]) => {
          const [consoleMethod, ...consoleArgs] = args;
          return console[consoleMethod](...consoleArgs);
        }, ...args);
      };

      return browserConsole;
    }, {}),
  };
};

const start = async (
  { opts }:
  { opts: ILaunchOptions },
) => {
  debug(`Starting sandbox`);

  process.on('unhandledRejection', (error) => {
    debug(`uncaughtException error: ${error}`);
    send({
      error: JSON.stringify(error),
      event: 'error',
    });
  });

  browserLaunching = launchChrome(opts);
  browserLaunching.then((browser) => {
    const port = browser._parsed.port;
    debug(`Browser launched on port ${port}`);
  });
};

const runCode = async({code, sandboxOpts}: {code: string, sandboxOpts: ISandboxOpts}) => {
  debug(`Sandbox start running code "${code}"`);

  let browser = await browserLaunching;
  const page = await browser.newPage();

  page.on('error', (error: Error) => {
    debug(`Page error: ${error.message}`);
    send({
      error: error.message,
      event: 'error',
    });
  });

  page.on('request', (request) => {
    if (request.url().startsWith('file://')) {
      page.browser().close();
    }
  });

  page.on('response', (response) => {
    if (response.url().startsWith('file://')) {
      page.browser().close();
    }
  });

  // @ts-ignore
  const pageLocation = `/devtools/page/${page._target._targetId}`;
  const port = browser._parsed.port;
  const data = {
    context: {
      port,
      url: pageLocation,
    },
    event: 'launched',
  };
  send(data);

  const sandbox = buildBrowserSandbox(page);
  const vm: any = new NodeVM({
    require: sandboxOpts,
    sandbox,
  });
  const handler = vm.run(code);

  await handler({ page, context: {} });
}


const cancel = async() => {
  debug(`Sandbox cancel jobs, clearing pages...`);

  let browser = await browserLaunching;
  const [blank, ...pages] = await browser.pages();
  pages.forEach((page) => page.close());
  blank.goto('about:blank');
}

process.on('message', (message) => {
  const { event } = message;

  if (event === 'start') {
    return start(message.context);
  }

  if (event === 'runcode') {
    return runCode(message.context);
  }

  if (event === 'cancel') {
    return cancel();
  }

  return;
});
