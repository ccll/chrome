import { ChildProcess, fork } from 'child_process';
import * as EventEmitter from 'events';
import * as path from 'path';

import { IConfig, IMessage, ISandboxOpts } from '../models/sandbox.interface';
import { getDebug } from '../utils';

const kill = require('tree-kill');
const debug = getDebug('sandbox');

export class BrowserlessSandbox extends EventEmitter {
  private child: ChildProcess;
  private timer: NodeJS.Timer | null;

  constructor({ timeout, opts }: IConfig) {
    super();

    this.child = fork(path.join(__dirname, 'child'));
    this.timer = timeout === -1 ? null : setTimeout(() => {
      debug(`Timeout reached, killing child process`);
      this.close();
    }, timeout);

    this.child.on('message', (message: IMessage) => {
      if (message.event === 'launched') {
        debug(`Sandbox ready, forwarding location`);
        this.emit('launched', message.context);
      }

      if (message.event === 'error') {
        debug(`Sandbox crashed, closing`);
        this.emit('error', message.context);
        this.close();
      }
    });

    this.child.on('error', (err) => {
      debug(`Error in sandbox ${err.message}, closing`);
      this.close();
    });

    this.child.send({
      context: { opts },
      event: 'start',
    });
  }

  public killed(): boolean {
    return this.child.killed;
  }

  public runCode({code, sandboxOpts}: {code: string, sandboxOpts: ISandboxOpts}) {
    debug('=== debug: runCode');
    this.child.send({
      context: {
        code,
        sandboxOpts,
      },
      event: 'runcode',
    });
  }

  public cancelJob() {
    this.child.send({
      context: {},
      event: 'cancel',
    });
  }

  public close() {
    this.timer && clearTimeout(this.timer);
    debug(`Closing child called, not really closing`);
    // debug(`Closing child`);
    // this.kill();
  }

  // private kill() {
  //   kill(this.child.pid, 'SIGKILL');
  // }
}
