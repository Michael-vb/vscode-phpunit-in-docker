import * as vscode from 'vscode';

export class TestErrorParser {
    public parseErrorMessages(output: string, test: vscode.TestItem): vscode.TestMessage[] {
        const messages: vscode.TestMessage[] = [];
        let errorBlocks = output.split(/^\d+\)/m).map(block => block.trim()).filter(block => block.length > 0);
        
        if (errorBlocks.length > 1 && !/\.php:\d+/.test(errorBlocks[0])) {
            errorBlocks.shift();
        }
        
        if (errorBlocks.length > 0) {
            for (const block of errorBlocks) {
                const lines = block.split(/\r?\n/).filter(line => line.trim() !== '');
                let mainMessage = (lines.length > 1) ? lines[1] : lines[0];

                const testMessage = new vscode.TestMessage(mainMessage + "\n\n\n" + block);
                const locationRegex = /([^\s]+\.php):(\d+)/;
                const locationMatch = block.match(locationRegex);
                if (locationMatch && test.uri) {
                    const lineNum = parseInt(locationMatch[2], 10) - 1;
                    testMessage.location = new vscode.Location(test.uri, new vscode.Position(lineNum, 0));
                } else {
                    testMessage.location = new vscode.Location(test.uri!, new vscode.Position(0, 0));
                }
                messages.push(testMessage);
            }
        } else {
            const testMessage = new vscode.TestMessage(output);
            testMessage.location = new vscode.Location(test.uri!, new vscode.Position(0, 0));
            messages.push(testMessage);
        }

        return messages;
    }

    public getErrorOutput(error: any): string {
        let output = '';
        if (error.stdout) {
            output += error.stdout;
        }
        if (error.stderr) {
            output += error.stderr;
        }
        if (!output) {
            output = error.message || 'Test execution failed';
        }
        return output;
    }
} 
