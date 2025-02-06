import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import * as extension from '../extension';
import { DockerPhpUnitTestController } from '../testController';

suite('Extension Test Suite', () => {
	let sandbox: sinon.SinonSandbox;
	let mockOutputChannel: any;
	let mockContext: vscode.ExtensionContext;
	let consoleStub: sinon.SinonStub;

	setup(() => {
		sandbox = sinon.createSandbox();
		
		// Create console.log stub first
		consoleStub = sandbox.stub(console, 'log');
		
		// Mock output channel
		mockOutputChannel = {
			appendLine: sinon.stub()
		};
		sandbox.stub(vscode.window, 'createOutputChannel').returns(mockOutputChannel);

		// Mock test controller
		sandbox.stub(vscode.tests, 'createTestController').returns({
			createRunProfile: sinon.stub(),
			dispose: sinon.stub(),
			items: { replace: sinon.stub() }
		} as any);

		// Mock extension context
		mockContext = {
			subscriptions: [],
			extensionPath: '',
			globalState: {} as vscode.Memento,
			workspaceState: {} as vscode.Memento,
			extensionUri: {} as vscode.Uri,
			environmentVariableCollection: {} as vscode.EnvironmentVariableCollection,
			storageUri: null,
			globalStorageUri: {} as vscode.Uri,
			logUri: {} as vscode.Uri,
			extensionMode: vscode.ExtensionMode.Test,
			asAbsolutePath: (path: string) => path,
			secrets: {} as vscode.SecretStorage,
			storagePath: '',
			globalStoragePath: '',
			logPath: ''
		} as unknown as vscode.ExtensionContext;
	});

	teardown(() => {
		sandbox.restore();
	});

	test('should activate successfully', () => {
		// Activate the extension
		extension.activate(mockContext);
	
		// Verify subscription count
		assert.strictEqual(mockContext.subscriptions.length, 1);
		assert.ok(mockContext.subscriptions[0] instanceof DockerPhpUnitTestController);

		// Verify output channel was created
		sinon.assert.calledOnce(vscode.window.createOutputChannel as sinon.SinonStub);
		sinon.assert.calledWith(vscode.window.createOutputChannel as sinon.SinonStub, 'PHPUnit Docker');

		// Verify output channel messages
		sinon.assert.calledWith(mockOutputChannel.appendLine, 'PHPUnit Docker extension is now active');
		sinon.assert.calledWith(mockOutputChannel.appendLine, 'PHPUnit Docker extension initialization complete');

		// Verify test controller was created
		sinon.assert.calledOnce(vscode.tests.createTestController as sinon.SinonStub);
		sinon.assert.calledWith(vscode.tests.createTestController as sinon.SinonStub, 'phpunitDocker');
	});

	test('should deactivate successfully', () => {
		// Deactivate should run without errors
		assert.doesNotThrow(() => {
			extension.deactivate();
		});
	});
});
