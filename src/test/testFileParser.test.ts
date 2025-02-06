import * as assert from 'assert';
import * as vscode from 'vscode';
import { TestFileParser } from '../testFileParser';
import * as fs from 'fs';
import { beforeEach, afterEach } from 'mocha';
import * as sinon from 'sinon';

suite('TestFileParser', () => {
    let outputChannel: vscode.OutputChannel;
    let testController: vscode.TestController;
    let parser: TestFileParser;
    let mockTestItem: vscode.TestItem;
    let tempFilePath: string;
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
    });

    test('should parse class name from test file', async () => {
        const testContent = `
            <?php
            class ExampleTest extends TestCase
            {
                public function testExample() {}
            }
        `;

        // Create temporary file
        tempFilePath = '/tmp/test.php';
        await fs.promises.writeFile(tempFilePath, testContent);
        (mockTestItem as any).uri = vscode.Uri.file(tempFilePath);

        await parser.parseTestFile(mockTestItem);

        assert.strictEqual(mockTestItem.label, 'ExampleTest');
        assert.strictEqual(mockTestItem.canResolveChildren, true);
    });

    test('should parse test methods with data provider', async () => {
        const testContent = `
            <?php
            class ExampleTest extends TestCase
            {
                /**
                 * @dataProvider provideTestData
                 */
                public function testWithProvider() {}

                public function testWithoutProvider() {}
            }
        `;

        tempFilePath = '/tmp/test.php';
        await fs.promises.writeFile(tempFilePath, testContent);
        (mockTestItem as any).uri = vscode.Uri.file(tempFilePath);

        const addStub = sandbox.stub();
        (mockTestItem as any).children = {
            replace: sandbox.stub(),
            add: addStub,
            size: 0,
        };

        await parser.parseTestFile(mockTestItem);

        assert.strictEqual(addStub.callCount, 2);
        assert.strictEqual(addStub.firstCall.args[0].id.includes('@'), true); // Method with provider
        assert.strictEqual(addStub.secondCall.args[0].id.endsWith('$'), true); // Method without provider
    });

    test('should handle file read errors gracefully', async () => {
        (mockTestItem as any).uri = vscode.Uri.file('/nonexistent/file.php');
        
        const appendLineStub = sandbox.stub();
        (outputChannel as any).appendLine = appendLineStub;

        await parser.parseTestFile(mockTestItem);
        
        assert.strictEqual(
            appendLineStub.calledWith(sinon.match(/^Error parsing test file:/)),
            true
        );
    });

    afterEach(async () => {
        // Cleanup temporary file if it exists
        if (tempFilePath) {
            try {
                await fs.promises.unlink(tempFilePath);
            } catch (err) {
                // Ignore cleanup errors
            }
        }
        sandbox.restore();
    });
}); 
