import * as vscode from 'vscode';
import * as fs from 'fs';

export class TestFileParser {
    constructor(
        private outputChannel: vscode.OutputChannel,
        private testController: vscode.TestController
    ) {}

    public async parseTestFile(testItem: vscode.TestItem): Promise<void> {
        if (!testItem.uri) { return; }
        
        if (testItem.children) {
            testItem.children.replace([]);
        }

        try {
            this.outputChannel.appendLine(`Resolving methods for test file: ${testItem.uri.fsPath}`);
            const content = await fs.promises.readFile(testItem.uri.fsPath, 'utf8');
            
            const classMatch = content.match(/class\s+(\w+)/);
            if (classMatch) {
                testItem.label = classMatch[1];
                testItem.canResolveChildren = true;
                
                const classLine = content.substring(0, classMatch.index).split('\n').length - 1;
                testItem.range = new vscode.Range(new vscode.Position(classLine, 0), new vscode.Position(classLine, 0));
                this.outputChannel.appendLine(`Found test class: ${classMatch[1]}`);
            }

            const methodRegex = /public\s+function\s+(test\w+)\s*\(/g;
            let match;
            while ((match = methodRegex.exec(content)) !== null) {
                const methodName = match[1];
                this.outputChannel.appendLine(`Found test method: ${methodName}`);
                
                const methodStartIndex = match.index;
                const previousLines = content.substring(0, methodStartIndex).split('\n');
                const lastFewLines = previousLines.slice(-3).join('\n');
                const hasDataProvider = /@dataProvider/.test(lastFewLines);
                
                const methodId = hasDataProvider ? 
                    `${testItem.id}::${methodName}@.+` :
                    `${testItem.id}::${methodName}$`;
                
                const methodItem = this.testController.createTestItem(
                    methodId,
                    methodName,
                    testItem.uri
                );
                methodItem.canResolveChildren = false;
                
                const methodLine = content.substring(0, match.index).split('\n').length - 1;
                methodItem.range = new vscode.Range(new vscode.Position(methodLine, 0), new vscode.Position(methodLine, 0));
                
                testItem.children.add(methodItem);
            }
        } catch (err) {
            this.outputChannel.appendLine(`Error parsing test file: ${err}`);
        }
    }
} 
