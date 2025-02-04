import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';

const execAsync = promisify(exec);

export class DockerPhpUnitTestController {
    private testController: vscode.TestController;
    private disposables: vscode.Disposable[] = [];
    private outputChannel: vscode.OutputChannel;

    constructor(outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
        this.outputChannel.appendLine('Initializing DockerPhpUnitTestController');
        
        this.testController = vscode.tests.createTestController('phpunitDocker', 'PHPUnit in Docker');
        this.disposables.push(this.testController);

        this.testController.resolveHandler = async test => {
            if (!test) {
                this.outputChannel.appendLine('Resolving all tests');
                await this.discoverAllTests();
            } else {
                this.outputChannel.appendLine(`Resolving test methods for ${test.id}`);
                await this.resolveTestMethods(test);
            }
        };

        // Create Run profile
        this.testController.createRunProfile(
            'Run',
            vscode.TestRunProfileKind.Run,
            (request, token) => {
                this.runTests(request, token, false);
            },
            true // Make this the default run profile
        );

        // Create Debug profile
        this.testController.createRunProfile(
            'Debug',
            vscode.TestRunProfileKind.Debug,
            (request, token) => {
                this.runTests(request, token, true);
            }
        );

        const config = vscode.workspace.getConfiguration('phpunitDocker');
        const testFilePattern = config.get<string>('testFilePattern') || '**/*Test.php';
        this.outputChannel.appendLine(`Using file watcher pattern: ${testFilePattern}`);
        const watcher = vscode.workspace.createFileSystemWatcher(testFilePattern);
        this.disposables.push(watcher);

        watcher.onDidChange(uri => this.updateTestForFile(uri));
        watcher.onDidCreate(uri => this.addTestForFile(uri));
        watcher.onDidDelete(uri => this.removeTestForFile(uri));

        // Initial test discovery
        this.discoverAllTests();
    }

    public async discoverAllTests() {
        this.outputChannel.appendLine('Starting test discovery');
        const config = vscode.workspace.getConfiguration('phpunitDocker');
        const pattern = config.get<string>('testFilePattern') || '**/*Test.php';
        
        this.outputChannel.appendLine(`Using test file pattern: ${pattern}`);
        
        // Exclude the vendor folder so that tests inside it are not considered.
        const excludePattern = '**/vendor/**';
        this.outputChannel.appendLine(`Excluding files that match: ${excludePattern}`);
        
        // Clear existing items
        this.testController.items.replace([]);
        
        const files = await vscode.workspace.findFiles(pattern, excludePattern);
        this.outputChannel.appendLine(`Found ${files.length} test files`);
        
        for (const file of files) {
            this.outputChannel.appendLine(`Processing test file: ${file.fsPath}`);
            const testItem = this.testController.createTestItem(
                file.fsPath,
                path.basename(file.fsPath),
                file
            );
            testItem.canResolveChildren = true;
            this.testController.items.add(testItem);
            await this.resolveTestMethods(testItem);
        }
    }

    private async resolveTestMethods(testItem: vscode.TestItem) {
        if (!testItem.uri) { return; }
        
        // Clear any existing children to avoid duplicates if the method is called repeatedly
        if (testItem.children) {
            testItem.children.replace([]);
        }

        try {
            this.outputChannel.appendLine(`Resolving methods for test file: ${testItem.uri.fsPath}`);
            const content = await fs.promises.readFile(testItem.uri.fsPath, 'utf8');
            
            // Find class name and assign a location range so that the run button appears
            const classMatch = content.match(/class\s+(\w+)/);
            if (classMatch) {
                testItem.label = classMatch[1];
                testItem.canResolveChildren = true;
                
                // Calculate line number of the class declaration.
                const classLine = content.substring(0, classMatch.index).split('\n').length - 1;
                testItem.range = new vscode.Range(new vscode.Position(classLine, 0), new vscode.Position(classLine, 0));
                this.outputChannel.appendLine(`Found test class: ${classMatch[1]}`);
            }

            // Find test methods with a regex and assign a range to each found method
            const methodRegex = /public\s+function\s+(test\w+)\s*\(/g;
            let match;
            while ((match = methodRegex.exec(content)) !== null) {
                const methodName = match[1];
                this.outputChannel.appendLine(`Found test method: ${methodName}`);
                
                // Check for @dataProvider annotation in lines before the method
                const methodStartIndex = match.index;
                const previousLines = content.substring(0, methodStartIndex).split('\n');
                const lastFewLines = previousLines.slice(-3).join('\n'); // Check last 3 lines for annotation
                const hasDataProvider = /@dataProvider/.test(lastFewLines);
                
                // Add @{number} to id if method has @dataProvider
                const methodId = hasDataProvider ? 
                    `${testItem.id}::${methodName}@.+` :
                    `${testItem.id}::${methodName}$`;
                
                const methodItem = this.testController.createTestItem(
                    methodId,
                    methodName,
                    testItem.uri
                );
                // Make individual test methods runnable
                methodItem.canResolveChildren = false;
                
                // Compute the line number for the test method declaration.
                const methodLine = content.substring(0, match.index).split('\n').length - 1;
                methodItem.range = new vscode.Range(new vscode.Position(methodLine, 0), new vscode.Position(methodLine, 0));
                
                testItem.children.add(methodItem);
            }
        } catch (err) {
            this.outputChannel.appendLine(`Error parsing test file: ${err}`);
        }
    }

    private async runTests(
        request: vscode.TestRunRequest,
        token: vscode.CancellationToken,
        isDebug: boolean
    ) {
        const run = this.testController.createTestRun(request);
        const config = vscode.workspace.getConfiguration('phpunitDocker');
        
        const containerName = config.get<string>('containerName');
        const containerPath = config.get<string>('containerPath') || '/var/www';
        const phpunitPath = config.get<string>('phpunitPath') || 'vendor/bin/phpunit';

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

        // Add debug session check and startup
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
                } catch (error) {
                    this.outputChannel.appendLine(`Failed to start debug session: ${error}`);
                    run.end();
                    return;
                }
            }
        }

        // Get tests to run
        const testsToRun: vscode.TestItem[] = [];
        if (request.include) {
            testsToRun.push(...request.include);
        } else {
            this.testController.items.forEach(item => testsToRun.push(item));
        }

        for (const test of testsToRun) {
            if (token.isCancellationRequested) { 
                run.end();
                return;
            }

            run.started(test);
            try {
                const relativePath = vscode.workspace.asRelativePath(test.uri!);
                const containerFilePath = path.join(containerPath, relativePath);
                
                // Build the PHPUnit command
                let phpunitCommand = `php ${phpunitPath}`;
                if (isDebug) {
                    phpunitCommand = `php -dxdebug.mode=debug ${phpunitPath}`;
                }
                if (test.id.includes('::')) {
                    const [, methodName] = test.id.split('::');
                    phpunitCommand += ` --filter "${methodName}" ${containerFilePath}`;
                } else {
                    phpunitCommand += ` ${containerFilePath}`;
                }

                this.outputChannel.appendLine(`Executing command: ${phpunitCommand}`);
    
                // Execute the command
                const { stdout, stderr } = await execAsync(
                    `docker exec ${containerName} ${phpunitCommand}`
                );
    
                // If command succeeds, mark test as passed
                run.passed(test);
    
                this.outputChannel.appendLine('Test output:');
                this.outputChannel.appendLine(stdout);
                if (stderr) {
                    this.outputChannel.appendLine(stderr);
                }
            } catch (err) {
                // Capture both stdout and stderr from the error (if available) to show detailed output
                const error = err as any;
                let output = '';
                if (error.stdout) {
                    output += error.stdout;
                }
                if (error.stderr) {
                    output += error.stderr;
                }
                if (!output) {
                    output = error.message || 'Test execution failed';
                }

                // New error parsing logic to handle multiple error blocks formatted with numbering (e.g., "1) ...", "2) ...")
                const messages: vscode.TestMessage[] = [];
                // Split output by error blocks starting with a number followed by ')'
                let errorBlocks = output.split(/^\d+\)/m).map(block => block.trim()).filter(block => block.length > 0);
                // If multiple blocks exist and the first block doesn't include a file location, remove it.
                if (errorBlocks.length > 1 && !/\.php:\d+/.test(errorBlocks[0])) {
                    errorBlocks.shift();
                }
                
                if (errorBlocks.length > 0) {
                    for (const block of errorBlocks) {
                        // Split the block into non-empty lines
                        const lines = block.split(/\r?\n/).filter(line => line.trim() !== '');
                        // Expecting at least two lines: the test id and then the main error message
                        let mainMessage = (lines.length > 1) ? lines[1] : lines[0];

                        const testMessage = new vscode.TestMessage(mainMessage + "\n\n\n" + block);
                        const locationRegex = /([^\s]+\.php):(\d+)/;
                        const locationMatch = block.match(locationRegex);
                        if (locationMatch && test.uri) {
                            const lineNum = parseInt(locationMatch[2], 10) - 1;
                            testMessage.location = new vscode.Location(test.uri, new vscode.Position(lineNum, 0));
                        } else {
                            testMessage.location = new vscode.Location(test.uri!, new vscode.Position(0, 0));
                        }
                        messages.push(testMessage);
                    }
                } else {
                    // Fallback if no error blocks are found
                    const testMessage = new vscode.TestMessage(output);
                    testMessage.location = new vscode.Location(test.uri!, new vscode.Position(0, 0));
                    messages.push(testMessage);
                }
    
                run.failed(test, messages);
                this.outputChannel.appendLine(`Test execution error: ${output}`);
            }
        }
    
        run.end();
    }

    private async addTestForFile(uri: vscode.Uri): Promise<void> {
        this.outputChannel.appendLine(`Adding test file: ${uri.fsPath}`);
        const testItem = this.testController.createTestItem(
            uri.fsPath,
            path.basename(uri.fsPath),
            uri
        );
        testItem.canResolveChildren = true;
        this.testController.items.add(testItem);
        await this.resolveTestMethods(testItem);
    }

    private async updateTestForFile(uri: vscode.Uri): Promise<void> {
        this.outputChannel.appendLine(`Updating test file: ${uri.fsPath}`);
        const testItem = this.testController.items.get(uri.fsPath);
        if (testItem) {
            // Clear existing test methods to avoid duplicates.
            testItem.children.replace([]);
            await this.resolveTestMethods(testItem);
        } else {
            // If the test item doesn't exist, add it.
            await this.addTestForFile(uri);
        }
    }

    private removeTestForFile(uri: vscode.Uri): void {
        this.outputChannel.appendLine(`Removing test file: ${uri.fsPath}`);
        this.testController.items.delete(uri.fsPath);
    }

    dispose() {
        this.disposables.forEach(d => d.dispose());
    }
}
