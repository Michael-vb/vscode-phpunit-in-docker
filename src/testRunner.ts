import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { TestErrorParser } from './testErrorParser';

export class TestRunner {
    private errorParser: TestErrorParser;
    private execCommand: (command: string) => Promise<{ stdout: string; stderr: string }>;

    constructor(
        private testController: vscode.TestController,
        private outputChannel: vscode.OutputChannel
    ) {
        this.errorParser = new TestErrorParser();
        this.execCommand = promisify(exec);
    }

    public async runTests(
        request: vscode.TestRunRequest,
        token: vscode.CancellationToken,
        isDebug: boolean
    ) {
        const run = this.testController.createTestRun(request);
        const config = vscode.workspace.getConfiguration('phpunitDocker');
        
        const containerName = config.get<string>('containerName');
        const containerPath = config.get<string>('containerPath') || '/var/www';
        const phpunitPath = config.get<string>('phpunitPath') || 'vendor/bin/phpunit';

        let debugSessionToStop: vscode.DebugSession | undefined;

        if (!containerName) {
            const message = 'Docker container name is not configured. Please configure it in settings.';
            vscode.window.showErrorMessage(message, 'Open Settings').then(selection => {
                if (selection === 'Open Settings') {
                    vscode.commands.executeCommand('workbench.action.openSettings', 'phpunitDocker.containerName');
                }
            });
            run.end();
            return;
        }

        if (isDebug) {
            const debugSession = vscode.debug.activeDebugSession;
            if (!debugSession) {
                try {
                    this.outputChannel.appendLine('Starting debug session...');
                    const debugConfig = config.get<object>('debugConfiguration') || {
                        type: 'php',
                        name: 'Listen for Xdebug',
                        request: 'launch',
                        port: 9003,
                        pathMappings: {
                            [containerPath]: "${workspaceFolder}"
                        }
                    };
                    await vscode.debug.startDebugging(undefined, debugConfig as any);
                    debugSessionToStop = vscode.debug.activeDebugSession;
                } catch (error) {
                    this.outputChannel.appendLine(`Failed to start debug session: ${error}`);
                    run.end();
                    return;
                }
            }
        }

        const testsToRun: vscode.TestItem[] = [];
        if (request.include) {
            testsToRun.push(...request.include);
        } else {
            this.testController.items.forEach(item => testsToRun.push(item));
        }

        await this.executeTests(testsToRun, run, token, {
            containerName,
            containerPath,
            phpunitPath,
            isDebug
        });

        run.end();

        if (debugSessionToStop) {
            try {
                this.outputChannel.appendLine('Stopping debug session...');
                await vscode.debug.stopDebugging(debugSessionToStop);
                this.outputChannel.appendLine('Debug session stopped');
            } catch (error) {
                this.outputChannel.appendLine(`Error stopping debug session: ${error}`);
            }
        }
    }

    private async executeTests(
        tests: vscode.TestItem[],
        run: vscode.TestRun,
        token: vscode.CancellationToken,
        options: {
            containerName: string;
            containerPath: string;
            phpunitPath: string;
            isDebug: boolean;
        }
    ) {
        for (const test of tests) {
            if (token.isCancellationRequested) { return; }

            run.started(test);
            try {
                const relativePath = vscode.workspace.asRelativePath(test.uri!);
                const containerFilePath = path.join(options.containerPath, relativePath);
                
                let phpunitCommand = `php ${options.phpunitPath}`;
                if (options.isDebug) {
                    phpunitCommand = `php -dxdebug.mode=debug ${options.phpunitPath}`;
                }
                if (test.id.includes('::')) {
                    const [, methodName] = test.id.split('::');
                    phpunitCommand += ` --filter "${methodName}" ${containerFilePath}`;
                } else {
                    phpunitCommand += ` ${containerFilePath}`;
                }

                this.outputChannel.appendLine(`Executing command: ${phpunitCommand}`);
    
                const { stdout, stderr } = await this.execCommand(
                    `docker exec -t ${options.containerName} ${phpunitCommand}`
                );

                run.appendOutput(`${stdout}`);
                run.passed(test);
            } catch (err: any) {
                const output = this.errorParser.getErrorOutput(err);
                run.appendOutput(`${output}`);

                const messages = this.errorParser.parseErrorMessages(output, test);
                run.failed(test, messages);
                this.outputChannel.appendLine(`Test execution error: ${output}`);
            }
        }
    }

    public setExecCommand(execCommand: (command: string) => Promise<{ stdout: string; stderr: string }>) {
        this.execCommand = execCommand;
    }
}
