import * as vscode from 'vscode';

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
            
            const document = await vscode.workspace.openTextDocument(testItem.uri);
            const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                'vscode.executeDocumentSymbolProvider', 
                testItem.uri
            );

            if (!symbols || symbols.length === 0) {
                this.outputChannel.appendLine('No symbols found');
                return;
            }

            // Find the test class (assuming one class per file for simplicity)
            const classSymbol = symbols.find(s => s.kind === vscode.SymbolKind.Class);
            if (!classSymbol) {
                this.outputChannel.appendLine('No test class found');
                return;
            }

            // Get class text using symbol range from the document
            const classText = document.getText(classSymbol.range);
            const classLines = classText.split('\n');
            let classSignatureStartLine = classSymbol.range.start.line;
            for (let i = 0; i < classLines.length; i++) {
                const lineText = classLines[i];
                if (lineText.includes(`class ${classSymbol.name}`)) {
                    classSignatureStartLine += i; // Adjust line number based on the block
                    break;
                }
            }

            testItem.label = classSymbol.name;
            testItem.canResolveChildren = true;
            testItem.range = new vscode.Range(
                new vscode.Position(classSignatureStartLine, 0),
                classSymbol.range.end
            );
            this.outputChannel.appendLine(`Found test class: ${classSymbol.name}`);

            // Find all test methods (methods starting with 'test')
            const methodSymbols = symbols.flatMap(s => 
                s.kind === vscode.SymbolKind.Class ? s.children : []
            ).filter(s => s.kind === vscode.SymbolKind.Method);

            for (const methodSymbol of methodSymbols) {
                const methodName = methodSymbol.name;
                const isTestMethod = methodName.startsWith('test');
                if (!isTestMethod) {
                    continue;
                }

                // Get method text using symbol range from the document
                const methodText = document.getText(methodSymbol.range);

                this.outputChannel.appendLine(`Found test method: ${methodName}`);

                const lines = methodText.split('\n');

                let hasDataProvider = false;
                let signatureStartLine = methodSymbol.range.start.line;
                for (let i = 0; i < lines.length; i++) {
                    const lineText = lines[i];
                    if (lineText.includes(`function ${methodName}`)) {
                        signatureStartLine += i; // Adjust line number based on the block
                        break;
                    }
                    if (!hasDataProvider) {
                        hasDataProvider = lineText.includes('@dataProvider');
                    }
                }

                const methodId = hasDataProvider ? 
                    `${testItem.id}::${methodName}` :
                    `${testItem.id}::${methodName}$`;

                const methodItem = this.testController.createTestItem(
                    methodId,
                    methodName,
                    testItem.uri
                );
                
                methodItem.canResolveChildren = false;
                
                methodItem.range = new vscode.Range(
                    new vscode.Position(signatureStartLine, 0),
                    methodSymbol.range.end
                );
                testItem.children.add(methodItem);
            }
        } catch (err) {
            this.outputChannel.appendLine(`Error parsing test file: ${err}`);
        }
    }
} 
