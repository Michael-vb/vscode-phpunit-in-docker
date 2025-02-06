import * as vscode from 'vscode';
import { TestDiscovery } from './testDiscovery';
import { TestRunner } from './testRunner';

export class DockerPhpUnitTestController {
    private testController: vscode.TestController;
    private disposables: vscode.Disposable[] = [];
    private outputChannel: vscode.OutputChannel;
    private testDiscovery: TestDiscovery;
    private testRunner: TestRunner;

    constructor(outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
        this.outputChannel.appendLine('Initializing DockerPhpUnitTestController');
        
        this.testController = vscode.tests.createTestController('phpunitDocker', 'PHPUnit in Docker');
        this.disposables.push(this.testController);

        this.testDiscovery = new TestDiscovery(this.testController, this.outputChannel);
        this.testRunner = new TestRunner(this.testController, this.outputChannel);

        this.testController.resolveHandler = async test => {
            if (!test) {
                this.outputChannel.appendLine('Resolving all tests');
                await this.testDiscovery.discoverAllTests();
            } else {
                this.outputChannel.appendLine(`Resolving test methods for ${test.id}`);
                await this.testDiscovery.resolveTestMethods(test);
            }
        };

        this.setupRunProfiles();
        this.setupFileWatcher();
        this.testDiscovery.discoverAllTests();
    }

    private setupRunProfiles() {
        this.testController.createRunProfile(
            'Run',
            vscode.TestRunProfileKind.Run,
            (request, token) => {
                this.testRunner.runTests(request, token, false);
            },
            true
        );

        this.testController.createRunProfile(
            'Debug',
            vscode.TestRunProfileKind.Debug,
            (request, token) => {
                this.testRunner.runTests(request, token, true);
            }
        );
    }

    private setupFileWatcher() {
        const config = vscode.workspace.getConfiguration('phpunitDocker');
        const testFilePattern = config.get<string>('testFilePattern') || '**/*Test.php';
        this.outputChannel.appendLine(`Using file watcher pattern: ${testFilePattern}`);
        
        const watcher = vscode.workspace.createFileSystemWatcher(testFilePattern);
        this.disposables.push(watcher);

        watcher.onDidChange(uri => this.testDiscovery.updateTestForFile(uri));
        watcher.onDidCreate(uri => this.testDiscovery.addTestForFile(uri));
        watcher.onDidDelete(uri => this.testDiscovery.removeTestForFile(uri));
    }

    dispose() {
        this.disposables.forEach(d => d.dispose());
    }
}
