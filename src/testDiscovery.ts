import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { TestFileParser } from './testFileParser';

export class TestDiscovery {
    private testFileParser: TestFileParser;

    constructor(
        private testController: vscode.TestController,
        private outputChannel: vscode.OutputChannel
    ) {
        this.testFileParser = new TestFileParser(outputChannel, testController);
    }

    public async discoverAllTests() {
        this.outputChannel.appendLine('Starting test discovery');
        const config = vscode.workspace.getConfiguration('phpunitDocker');
        const pattern = config.get<string>('testFilePattern') || '**/*Test.php';
        
        this.outputChannel.appendLine(`Using test file pattern: ${pattern}`);
        
        const excludePattern = '**/vendor/**';
        this.outputChannel.appendLine(`Excluding files that match: ${excludePattern}`);
        
        this.testController.items.replace([]);
        
        const files = await vscode.workspace.findFiles(pattern, excludePattern);
        this.outputChannel.appendLine(`Found ${files.length} test files`);
        
        for (const file of files) {
            await this.addTestForFile(file);
        }
    }

    public async resolveTestMethods(testItem: vscode.TestItem) {
        await this.testFileParser.parseTestFile(testItem);
    }

    public async addTestForFile(uri: vscode.Uri): Promise<void> {
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

    public async updateTestForFile(uri: vscode.Uri): Promise<void> {
        this.outputChannel.appendLine(`Updating test file: ${uri.fsPath}`);
        const testItem = this.testController.items.get(uri.fsPath);
        if (testItem) {
            await this.resolveTestMethods(testItem);
        } else {
            await this.addTestForFile(uri);
        }
    }

    public removeTestForFile(uri: vscode.Uri): void {
        this.outputChannel.appendLine(`Removing test file: ${uri.fsPath}`);
        this.testController.items.delete(uri.fsPath);
    }
}
