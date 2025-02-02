# PHPUnit in Docker Extension for VS Code

This extension was developed with the assistance of AI tools.

Run PHPUnit tests inside Docker containers directly from VS Code's Test Explorer UI.

## Features

- 🐳 Execute PHPUnit tests in Docker containers
- 🔍 Automatic test discovery based on file patterns
- ▶️ Run tests at multiple levels (file, class, method)
- 🐛 Debug support with Xdebug integration
- 📋 Rich error reporting with source locations
- 📂 Configurable container paths and PHPUnit locations

## Installation

1. Install the extension from VS Code Marketplace
2. Ensure your Docker container is running with your PHP project mounted
3. Configure the extension settings (see below)

## Configuration

Open VS Code settings (Ctrl+,) and configure under "PHPUnit in Docker":

- `phpunitDocker.containerName`: **Required**  
  Your Docker container name (e.g. `my-php-container`)
- `phpunitDocker.containerPath`: Path inside container where project is mounted  
  (Default: `/var/www/app`)
- `phpunitDocker.phpunitPath`: Path to PHPUnit executable  
  (Default: `vendor/bin/phpunit`)
- `phpunitDocker.testFilePattern`: Glob pattern for test files  
  (Default: `**/*Test.php`)

## Usage

1. Open the Test Explorer (View → Testing)
2. Tests will automatically discover from your project
3. Use the run/debug icons next to:
   - Individual test methods
   - Test classes
   - Entire test files

## Debugging Tests

1. Ensure Xdebug is configured in your Docker container
2. Set breakpoints in your test files
3. Use the "Debug" profile from the Test Explorer
4. VS Code will automatically attach to the debugger
