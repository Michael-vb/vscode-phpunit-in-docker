import * as assert from 'assert';
import { normalizeContainerPaths } from '../../utils/pathNormalizer';

suite('PathNormalizer', () => {
    test('should remove container path from output', () => {
        const input = 'Failed asserting that false is true in /var/www/tests/TestClass.php:123';
        const result = normalizeContainerPaths(input, '/var/www');
        assert.strictEqual(result, 'Failed asserting that false is true in tests/TestClass.php:123');
    });

    test('should handle container path with trailing slash', () => {
        const input = 'Error in /var/www/app/tests/Unit/SomeTest.php:65';
        const result = normalizeContainerPaths(input, '/var/www/');
        assert.strictEqual(result, 'Error in app/tests/Unit/SomeTest.php:65');
    });

    test('should handle multiple occurrences of container path', () => {
        const input = 'Found in /var/www/test1.php and /var/www/test2.php';
        const result = normalizeContainerPaths(input, '/var/www');
        assert.strictEqual(result, 'Found in test1.php and test2.php');
    });

    test('should return original string if container path not found', () => {
        const input = 'No container path here';
        const result = normalizeContainerPaths(input, '/var/www');
        assert.strictEqual(result, 'No container path here');
    });
}); 
