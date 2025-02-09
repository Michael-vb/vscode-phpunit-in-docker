import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { TestRunner } from '../testRunner';

suite('TestRunner', () => {
    let testRunner: TestRunner;
    let testController: vscode.TestController;
    let outputChannel: vscode.OutputChannel;
    let sandbox: sinon.SinonSandbox;

    setup(() => {
        sandbox = sinon.createSandbox();
        
        // Mock VSCode test controller
        testController = {
            createTestRun: sandbox.stub().returns({
                started: sandbox.stub(),
                passed: sandbox.stub(),
                failed: sandbox.stub(),
                end: sandbox.stub(),
                appendOutput: sandbox.stub()
            }),
            items: new Map()
        } as unknown as vscode.TestController;

        // Mock output channel
        outputChannel = {
            appendLine: sandbox.stub()
        } as unknown as vscode.OutputChannel;

        testRunner = new TestRunner(testController, outputChannel);
    });

    teardown(() => {
        sandbox.restore();
    });

    test('runTests should show error when container name is not configured', async () => {
        // Mock workspace configuration
        sandbox.stub(vscode.workspace, 'getConfiguration')
            .returns({
                get: sandbox.stub().returns(undefined)
            } as any);

        // Mock window.showErrorMessage
        const showErrorStub = sandbox.stub(vscode.window, 'showErrorMessage')
            .resolves(undefined);

        const request = {} as vscode.TestRunRequest;
        const token = { isCancellationRequested: false } as vscode.CancellationToken;

        await testRunner.runTests(request, token, false);

        assert.strictEqual(showErrorStub.calledOnce, true);
        assert.strictEqual(
            showErrorStub.firstCall.args[0],
            'Docker container name is not configured. Please configure it in settings.'
        );
    });

    test('runTests should execute tests successfully', async () => {
        // Mock workspace configuration
        sandbox.stub(vscode.workspace, 'getConfiguration')
            .returns({
                get: sandbox.stub().callsFake((key: string) => {
                    if (key === 'containerName') {return 'test-container';};
                    if (key === 'containerPath') {return '/var/www';};
                    if (key === 'phpunitPath') {return 'vendor/bin/phpunit';};
                    return undefined;
                })
            } as any);

        // Mock test item
        const testItem = {
            id: 'TestClass::testMethod',
            uri: vscode.Uri.file('/workspace/tests/TestClass.php')
        } as vscode.TestItem;

        // Mock workspace.asRelativePath
        sandbox.stub(vscode.workspace, 'asRelativePath')
            .returns('tests/TestClass.php');

        // Mock child_process.exec
        const execStub = sandbox.stub().resolves({
            stdout: 'OK (1 test, 1 assertion)',
            stderr: ''
        });
        testRunner.setExecCommand(execStub);

        const request = {
            include: [testItem]
        } as unknown as vscode.TestRunRequest;
        const token = { isCancellationRequested: false } as vscode.CancellationToken;

        await testRunner.runTests(request, token, false);

        // Verify test execution
        const run = (testController.createTestRun as sinon.SinonStub).getCall(0).returnValue;
        sinon.assert.calledWith(run.started, sinon.match.same(testItem));
        sinon.assert.calledWith(run.passed, sinon.match.same(testItem));
        sinon.assert.calledOnce(run.end);

        // Verify docker command
        assert.strictEqual(execStub.calledOnce, true);
        assert.strictEqual(
            execStub.firstCall.args[0],
            'docker exec -t test-container php vendor/bin/phpunit --filter "testMethod" /var/www/tests/TestClass.php'
        );
    });

    test('runTests should handle test failures', async () => {
        // Mock workspace configuration
        sandbox.stub(vscode.workspace, 'getConfiguration')
            .returns({
                get: sandbox.stub().returns('test-container')
            } as any);

        // Mock test item
        const testItem = {
            id: 'TestClass::testMethod',
            uri: vscode.Uri.file('/workspace/tests/TestClass.php')
        } as vscode.TestItem;

        // Mock workspace.asRelativePath
        sandbox.stub(vscode.workspace, 'asRelativePath')
            .returns('tests/TestClass.php');

        // Mock child_process.exec to throw error
        const execError = new Error('Test failed');
        (execError as any).stdout = 'Test output';
        (execError as any).stderr = 'Test error';
        const execStub = sandbox.stub().rejects(execError);
        testRunner.setExecCommand(execStub);

        const request = {
            include: [testItem]
        } as unknown as vscode.TestRunRequest;
        const token = { isCancellationRequested: false } as vscode.CancellationToken;

        await testRunner.runTests(request, token, false);

        // Verify test execution
        const run = (testController.createTestRun as sinon.SinonStub).getCall(0).returnValue;
        sinon.assert.calledWith(run.started, sinon.match.same(testItem));
        sinon.assert.calledWith(run.failed, sinon.match.same(testItem));
        sinon.assert.calledOnce(run.end);
    });

    test('runTests should normalize container paths in output', async () => {
        // Mock workspace configuration
        sandbox.stub(vscode.workspace, 'getConfiguration')
            .returns({
                get: sandbox.stub().callsFake((key: string) => {
                    if (key === 'containerName') {return 'test-container';};
                    if (key === 'containerPath') {return '/var/www';};
                    if (key === 'phpunitPath') {return 'vendor/bin/phpunit';};
                    return undefined;
                })
            } as any);

        const testItem = {
            id: 'TestClass::testMethod',
            uri: vscode.Uri.file('/workspace/tests/TestClass.php')
        } as vscode.TestItem;

        sandbox.stub(vscode.workspace, 'asRelativePath')
            .returns('tests/TestClass.php');

        // Mock exec with output containing container paths
        const execStub = sandbox.stub().rejects({
            message: 'Test failed',
            stdout: 'Failed asserting that false is true in /var/www/tests/TestClass.php:123',
            stderr: ''
        });
        testRunner.setExecCommand(execStub);

        const request = {
            include: [testItem]
        } as unknown as vscode.TestRunRequest;
        const token = { isCancellationRequested: false } as vscode.CancellationToken;

        await testRunner.runTests(request, token, false);

        // Verify that container paths were removed from output
        const run = (testController.createTestRun as sinon.SinonStub).getCall(0).returnValue;
        sinon.assert.calledWith(
            run.appendOutput,
            sinon.match((output: string) => output.includes('tests/TestClass.php:123') && !output.includes('/var/www/'))
        );
    });
});
