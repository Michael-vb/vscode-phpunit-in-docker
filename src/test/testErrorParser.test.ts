import * as assert from 'assert';
import * as vscode from 'vscode';
import { TestErrorParser } from '../testErrorParser';

suite('TestErrorParser', () => {
    let parser: TestErrorParser;
    let mockTestItem: vscode.TestItem;

    setup(() => {
        parser = new TestErrorParser();
        mockTestItem = {
            id: 'test1',
            uri: vscode.Uri.file('/path/to/test.php'),
            label: 'TestClass',
        } as vscode.TestItem;
    });

    suite('parseErrorMessages', () => {
        test('should parse PHPUnit error block format', () => {
            const output = `
1) TestClass::testMethod
Some error message
/path/to/test.php:25
Some additional context

2) TestClass::anotherTest
Another error occurred
/path/to/test.php:42
More details here
`;
            const messages = parser.parseErrorMessages(output, mockTestItem);

            assert.strictEqual(messages.length, 2);
            assert.strictEqual(messages[0].message, 'Some error message\n\n\nTestClass::testMethod\nSome error message\n/path/to/test.php:25\nSome additional context');
            assert.strictEqual(messages[1].message, 'Another error occurred\n\n\nTestClass::anotherTest\nAnother error occurred\n/path/to/test.php:42\nMore details here');
            assert.strictEqual((messages[0].location as vscode.Location).range.start.line, 24); // 0-based line number
            assert.strictEqual((messages[1].location as vscode.Location).range.start.line, 41);
        });

        test('should handle output without line numbers', () => {
            const output = 'General error occurred without line numbers';
            const messages = parser.parseErrorMessages(output, mockTestItem);

            assert.strictEqual(messages.length, 1);
            assert.strictEqual(messages[0].message, output + '\n\n\n' + output);
            assert.strictEqual((messages[0].location as vscode.Location).range.start.line, 0);
        });

        test('should handle empty output', () => {
            const messages = parser.parseErrorMessages('', mockTestItem);
            assert.strictEqual(messages.length, 1);
            assert.strictEqual(messages[0].message, '');
        });

        test('should skip initial summary block if present', () => {
            const output = `
There were 2 failures:

1) TestClass::testMethod
Some error message
/path/to/test.php:25

2) TestClass::anotherTest
Another error
/path/to/test.php:42
`;
            const messages = parser.parseErrorMessages(output, mockTestItem);

            assert.strictEqual(messages.length, 2);
            assert.strictEqual(String(messages[0].message).includes('Some error message'), true);
            assert.strictEqual(String(messages[1].message).includes('Another error'), true);
        });
    });

    suite('getErrorOutput', () => {
        test('should combine stdout and stderr', () => {
            const error = {
                stdout: 'Standard output\n',
                stderr: 'Error output'
            };
            const output = parser.getErrorOutput(error);
            assert.strictEqual(output, 'Standard output\nError output');
        });

        test('should handle stdout only', () => {
            const error = {
                stdout: 'Standard output'
            };
            const output = parser.getErrorOutput(error);
            assert.strictEqual(output, 'Standard output');
        });

        test('should handle stderr only', () => {
            const error = {
                stderr: 'Error output'
            };
            const output = parser.getErrorOutput(error);
            assert.strictEqual(output, 'Error output');
        });

        test('should use error message if no output', () => {
            const error = {
                message: 'Error message'
            };
            const output = parser.getErrorOutput(error);
            assert.strictEqual(output, 'Error message');
        });

        test('should use default message if no error info', () => {
            const error = {};
            const output = parser.getErrorOutput(error);
            assert.strictEqual(output, 'Test execution failed');
        });
    });
}); 
