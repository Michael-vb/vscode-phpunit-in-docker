import * as assert from 'assert';
import * as vscode from 'vscode';
import { DockerPhpUnitTestController } from '../testController';
import * as sinon from 'sinon';

// Mock the VS Code API and other dependencies
const mockOutputChannel = {
    appendLine: sinon.stub(),
};

const mockTestController = {
    createRunProfile: sinon.stub(),
    dispose: sinon.stub(),
    resolveHandler: sinon.stub(),
    items: {
        replace: sinon.stub(),
        add: sinon.stub(),
        delete: sinon.stub(),
        get: sinon.stub()
    }
};

const mockFileSystemWatcher = {
    onDidChange: sinon.stub(),
    onDidCreate: sinon.stub(),
    onDidDelete: sinon.stub(),
    dispose: sinon.stub(),
};

const mockWorkspaceConfiguration = {
    get: sinon.stub(),
};

suite('DockerPhpUnitTestController Test Suite', () => {
    let testController: DockerPhpUnitTestController;
    let sandbox: sinon.SinonSandbox;

    setup(() => {
        sandbox = sinon.createSandbox();

        // Stub individual methods on vscode.workspace (avoid stubbing the whole object)
        sandbox.stub(vscode.workspace, 'getConfiguration').returns(mockWorkspaceConfiguration as any);
        sandbox.stub(vscode.workspace, 'createFileSystemWatcher').returns(mockFileSystemWatcher as any);
        // Return a test file pattern from the configuration
        mockWorkspaceConfiguration.get.withArgs('testFilePattern').returns('**/*Test.php');

        // Stub createTestController from vscode.tests
        sandbox.stub(vscode.tests, 'createTestController').returns(mockTestController as any);

        // Instantiate the DockerPhpUnitTestController. The constructor will create testDiscovery and testRunner.
        testController = new DockerPhpUnitTestController(mockOutputChannel as any);
        // Override the inner testController with our mock.
        (testController as any).testController = mockTestController;

        // Stub the discoverAllTests and resolveTestMethods methods on the existing testDiscovery instance.
        sandbox.stub((testController as any).testDiscovery, 'discoverAllTests').resolves();
        sandbox.stub((testController as any).testDiscovery, 'resolveTestMethods').resolves();
    });

    teardown(() => {
        sandbox.restore();
    });

    test('Constructor should initialize correctly', () => {
        // Verify that the output channel appended the initialization message
        sinon.assert.calledWith(mockOutputChannel.appendLine, 'Initializing DockerPhpUnitTestController');
        // Two run profiles (Run and Debug) must have been created
        assert.strictEqual(mockTestController.createRunProfile.callCount, 2);
    });

    test('dispose should dispose resources', () => {
        testController.dispose();
        assert.strictEqual(mockTestController.dispose.callCount, 1);
    });

    test('setupFileWatcher should create a file system watcher', () => {
        // The constructor already calls setupFileWatcher, so verify that createFileSystemWatcher was called on vscode.workspace
        assert.strictEqual((vscode.workspace.createFileSystemWatcher as sinon.SinonStub).callCount, 1);
    });

    test('resolveHandler should call discoverAllTests when no test is provided', async () => {
        // Call the resolveHandler on the inner testController.
        await (testController as any).testController.resolveHandler(undefined);
        // Verify that discoverAllTests (now stubbed on the original testDiscovery instance) was called once.
        const callCount = (testController as any).testDiscovery.discoverAllTests.callCount;
        assert.strictEqual(callCount, 1);
        sinon.assert.calledWith(mockOutputChannel.appendLine, 'Resolving all tests');
    });

    test('resolveHandler should call resolveTestMethods when a test is provided', async () => {
        const mockTestItem = { id: 'testId' };
        // Call the resolveHandler on the inner testController.
        await (testController as any).testController.resolveHandler(mockTestItem as any);
        const callCount = (testController as any).testDiscovery.resolveTestMethods.callCount;
        assert.strictEqual(callCount, 1);
        assert.deepStrictEqual((testController as any).testDiscovery.resolveTestMethods.firstCall.args[0], mockTestItem);
        sinon.assert.calledWith(mockOutputChannel.appendLine, `Resolving test methods for ${mockTestItem.id}`);
    });
}); 
