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

        // Watch for PHP files
        const watcher = vscode.workspace.createFileSystemWatcher('**/*.php');
        this.disposables.push(watcher);

        watcher.onDidChange(() => this.discoverAllTests());
        watcher.onDidCreate(() => this.discoverAllTests());
        watcher.onDidDelete(() => this.discoverAllTests());

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
                const methodItem = this.testController.createTestItem(
                    `${testItem.id}::${methodName}`,
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

        const containerPath = config.get<string>('containerPath') || '/var/www/app';
        const phpunitPath = config.get<string>('phpunitPath') || 'vendor/bin/phpunit';

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
                    phpunitCommand += ` --filter "${methodName}$" ${containerFilePath}`;
                } else {
                    phpunitCommand += ` ${containerFilePath}`;
                }
    
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

                // Parse output for all failing assertions starting with "Failed asserting"
                const messages: vscode.TestMessage[] = [];
                const assertionRegex = /Failed asserting[\s\S]*?(?=Failed asserting|$)/g;
                let match: RegExpExecArray | null;
                while ((match = assertionRegex.exec(output)) !== null) {
                    const messageText = match[0].trim();
                    const testMessage = new vscode.TestMessage(messageText);
                    // Attempt to extract a file location (e.g., "ExampleTest.php:25")
                    const locationRegex = /([^:\s]+\.php):(\d+)/;
                    const locationMatch = locationRegex.exec(messageText);
                    if (locationMatch) {
                        const line = parseInt(locationMatch[2], 10) - 1;
                        testMessage.location = new vscode.Location(test.uri!, new vscode.Position(line, 0));
                    } else {
                        testMessage.location = new vscode.Location(test.uri!, new vscode.Position(0, 0));
                    }
                    messages.push(testMessage);
                }

                // Fallback if no individual assertion errors were found in the output
                if (messages.length === 0) {
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

    dispose() {
        this.disposables.forEach(d => d.dispose());
    }
}
