// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { DockerPhpUnitTestController } from './testController';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	console.log('Activating PHPUnit Docker extension');
	
	// Create output channel for better logging
	const outputChannel = vscode.window.createOutputChannel('PHPUnit Docker');
	outputChannel.appendLine('PHPUnit Docker extension is now active');
	
	// Create and register the controller
	const controller = new DockerPhpUnitTestController(outputChannel);
	context.subscriptions.push(controller);
	
	outputChannel.appendLine('PHPUnit Docker extension initialization complete');
}

// This method is called when your extension is deactivated
export function deactivate() {}
