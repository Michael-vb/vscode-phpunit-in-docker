import * as assert from 'assert';
import * as vscode from 'vscode';
import { TestFileParser } from '../testFileParser';
import { beforeEach, afterEach } from 'mocha';
import * as sinon from 'sinon';

suite('TestFileParser', () => {
    let outputChannel: vscode.OutputChannel;
    let testController: vscode.TestController;
    let parser: TestFileParser;
    let mockTestItem: vscode.TestItem;
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
        sandbox = sinon.createSandbox();

        // Setup mocks using Sinon
        outputChannel = {
            appendLine: sandbox.stub()
        } as any as vscode.OutputChannel;

        testController = {
            createTestItem: sandbox.stub().callsFake((id: string, label: string, uri?: vscode.Uri) => {
                return {
                    id,
                    label,
                    uri,
                    canResolveChildren: false,
                } as vscode.TestItem;
            }),
        } as any as vscode.TestController;

        parser = new TestFileParser(outputChannel, testController);

        // Create mock test item with Sinon stubs
        mockTestItem = {
            id: 'test1',
            uri: vscode.Uri.file('/tmp/test.php'),
            children: {
                replace: sandbox.stub(),
                add: sandbox.stub(),
                size: 0,
            },
            label: '',
            canResolveChildren: false,
        } as any as vscode.TestItem;

        // Mock vscode.workspace.openTextDocument
        sandbox.stub(vscode.workspace, 'openTextDocument').callsFake(async (uri) => {
            return {
                getText: (range?: vscode.Range) => {
                    // Return different content based on the range if provided
                    if (range) {
                        return 'class ExampleTest extends TestCase\n{\n    public function testExample() {}\n}';
                    }
                    return '<?php\nclass ExampleTest extends TestCase\n{\n    public function testExample() {}\n}';
                }
            } as any;
        });

        // Mock vscode.commands.executeCommand for document symbols
        sandbox.stub(vscode.commands, 'executeCommand').callsFake(async (command, ...args) => {
            if (command === 'vscode.executeDocumentSymbolProvider') {
                return [
                    {
                        name: 'ExampleTest',
                        kind: vscode.SymbolKind.Class,
                        range: new vscode.Range(1, 0, 4, 1),
                        selectionRange: new vscode.Range(1, 0, 1, 34),
                        children: [
                            {
                                name: 'testExample',
                                kind: vscode.SymbolKind.Method,
                                range: new vscode.Range(3, 4, 3, 33),
                                selectionRange: new vscode.Range(3, 4, 3, 33),
                                children: []
                            }
                        ]
                    }
                ];
            }
            return [];
        });
    });

    test('should parse class name from test file', async () => {
        await parser.parseTestFile(mockTestItem);

        assert.strictEqual(mockTestItem.label, 'ExampleTest');
        assert.strictEqual(mockTestItem.canResolveChildren, true);
    });

    test('should parse test methods with data provider', async () => {
        // Update the mock document symbols to include methods with and without data provider
        const executeCommandStub = vscode.commands.executeCommand as sinon.SinonStub;
        executeCommandStub.restore();
        
        sandbox.stub(vscode.commands, 'executeCommand').callsFake(async (command, ...args) => {
            if (command === 'vscode.executeDocumentSymbolProvider') {
                return [
                    {
                        name: 'ExampleTest',
                        kind: vscode.SymbolKind.Class,
                        range: new vscode.Range(1, 0, 8, 1),
                        selectionRange: new vscode.Range(1, 0, 1, 34),
                        children: [
                            {
                                name: 'testWithProvider',
                                kind: vscode.SymbolKind.Method,
                                range: new vscode.Range(6, 4, 6, 33),
                                selectionRange: new vscode.Range(6, 4, 6, 33),
                                children: []
                            },
                            {
                                name: 'testWithoutProvider',
                                kind: vscode.SymbolKind.Method,
                                range: new vscode.Range(8, 4, 8, 35),
                                selectionRange: new vscode.Range(8, 4, 8, 35),
                                children: []
                            }
                        ]
                    }
                ];
            }
            return [];
        });

        // Mock the document text to include data provider annotation
        const openTextDocumentStub = vscode.workspace.openTextDocument as sinon.SinonStub;
        openTextDocumentStub.restore();
        
        sandbox.stub(vscode.workspace, 'openTextDocument').callsFake(async (uri) => {
            return {
                getText: (range?: vscode.Range) => {
                    if (range) {
                        // If the range matches the first test method, include the data provider annotation
                        if (range.start.line === 6) {
                            return `    /**
     * @dataProvider provideTestData
     */
    public function testWithProvider() {}`;
                        }
                        // For the second test method, return without data provider
                        if (range.start.line === 8) {
                            return `    public function testWithoutProvider() {}`;
                        }
                    }
                    return `<?php
class ExampleTest extends TestCase
{
    /**
     * @dataProvider provideTestData
     */
    public function testWithProvider() {}

    public function testWithoutProvider() {}
}`;
                }
            } as any;
        });

        const addStub = sandbox.stub();
        (mockTestItem as any).children = {
            replace: sandbox.stub(),
            add: addStub,
            size: 0,
        };

        await parser.parseTestFile(mockTestItem);

        assert.strictEqual(addStub.callCount, 2);
        // First call should be the method with provider (no $ suffix)
        assert.strictEqual(addStub.firstCall.args[0].id.endsWith('testWithProvider'), true);
        // Second call should be the method without provider (has $ suffix)
        assert.strictEqual(addStub.secondCall.args[0].id.endsWith('testWithoutProvider$'), true);
    });

    test('should handle file read errors gracefully', async () => {
        const openTextDocumentStub = vscode.workspace.openTextDocument as sinon.SinonStub;
        openTextDocumentStub.restore();
        
        sandbox.stub(vscode.workspace, 'openTextDocument').rejects(new Error('File not found'));

        const appendLineStub = sandbox.stub();
        (outputChannel as any).appendLine = appendLineStub;

        await parser.parseTestFile(mockTestItem);
        
        assert.strictEqual(
            appendLineStub.calledWith(sinon.match(/^Error parsing test file:/)),
            true
        );
    });

    afterEach(() => {
        sandbox.restore();
    });
}); 
