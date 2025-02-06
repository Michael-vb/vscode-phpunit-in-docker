import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { TestDiscovery } from '../testDiscovery';
import { beforeEach, afterEach } from 'mocha';

suite('TestDiscovery', () => {
    let testController: vscode.TestController;
    let outputChannel: vscode.OutputChannel;
    let testDiscovery: TestDiscovery;
    let workspaceFolders: vscode.WorkspaceFolder[];
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        
        // Setup test controller with sinon stubs
        testController = {
            items: {
                replace: sandbox.stub().callsFake((items: readonly vscode.TestItem[]) => {}),
                add: sandbox.stub(),
                get: sandbox.stub(),
                delete: sandbox.stub()
            },
            createTestItem: sandbox.stub().callsFake((id: string, label: string, uri: vscode.Uri) => ({
                id,
                label,
                uri,
                canResolveChildren: true,
                children: {
                    replace: sandbox.stub(),
                    add: sandbox.stub(),
                    get: sandbox.stub()
                }
            }))
        } as any;

        outputChannel = {
            appendLine: sandbox.stub()
        } as any;

        workspaceFolders = [{
            uri: vscode.Uri.file('/project'),
            name: 'project',
            index: 0
        }];

        // Mock workspace functions using sinon
        sandbox.stub(vscode.workspace, 'getConfiguration').returns({
            get: sandbox.stub().returns('**/*Test.php')
        } as any);
        
        sandbox.stub(vscode.workspace, 'findFiles').resolves([
            vscode.Uri.file('/project/tests/ExampleTest.php'),
            vscode.Uri.file('/project/tests/AnotherTest.php')
        ]);

        sandbox.stub(vscode.workspace, 'workspaceFolders').value(workspaceFolders);

        testDiscovery = new TestDiscovery(testController, outputChannel);
    });

    test('should discover all test files', async () => {
        await testDiscovery.discoverAllTests();

        sinon.assert.calledWith(testController.items.replace as sinon.SinonStub, []);
        assert.strictEqual((testController.items.add as sinon.SinonStub).callCount, 2);
        sinon.assert.calledWith(
            testController.items.add as sinon.SinonStub, 
            sinon.match({ id: '/project/tests/ExampleTest.php' })
        );
        sinon.assert.calledWith(
            testController.items.add as sinon.SinonStub,
            sinon.match({ id: '/project/tests/AnotherTest.php' })
        );
    });

    test('should handle no test files found', async () => {
        (vscode.workspace.findFiles as sinon.SinonStub).resolves([]);

        await testDiscovery.discoverAllTests();

        sinon.assert.calledOnce(testController.items.replace as sinon.SinonStub);
    });

    test('should add test for file', async () => {
        const uri = vscode.Uri.file('/project/tests/NewTest.php');

        await testDiscovery.addTestForFile(uri);

        sinon.assert.calledWith(
            testController.items.add as sinon.SinonStub,
            sinon.match({
                label: 'NewTest.php',
                uri: uri
            })
        );
    });

    test('should update existing test item', async () => {
        const uri = vscode.Uri.file('/project/tests/ExistingTest.php');
        const testItem = {
            id: uri.fsPath,
            label: 'ExistingTest.php',
            uri,
            children: {
                replace: sandbox.stub()
            }
        };
        
        (testController.items.get as sinon.SinonStub).returns(testItem);

        await testDiscovery.updateTestForFile(uri);

        sinon.assert.calledOnce(testItem.children.replace as sinon.SinonStub);
    });

    test('should remove test for file', () => {
        const uri = vscode.Uri.file('/project/tests/RemoveTest.php');

        testDiscovery.removeTestForFile(uri);

        sinon.assert.calledWith(testController.items.delete as sinon.SinonStub, uri.fsPath);
    });

    afterEach(() => {
        sandbox.restore();
    });
});
