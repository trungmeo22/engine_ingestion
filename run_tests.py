#!/usr/bin/env python3
import sys
from pathlib import Path
import unittest

# Setup paths
root_dir = Path(__file__).resolve().parent
lib_dir = root_dir / "lib"
sys.path.insert(0, str(lib_dir))
sys.path.insert(0, str(root_dir))

if __name__ == "__main__":
    try:
        import pytest
        test_args = ["tests/", "-v"] + sys.argv[1:]
        exit_code = pytest.main(test_args)
        sys.exit(exit_code)
    except ImportError:
        loader = unittest.TestLoader()
        start_dir = str(root_dir / "tests")
        suite = loader.discover(start_dir, pattern="test_*.py")
        runner = unittest.TextTestRunner(verbosity=2)
        result = runner.run(suite)
        sys.exit(0 if result.wasSuccessful() else 1)
