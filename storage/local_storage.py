import os
import shutil
from abc import ABC, abstractmethod
from pathlib import Path
from typing import BinaryIO, Optional, Union


class StorageBackend(ABC):
    """Abstract storage interface for document artifacts."""

    @abstractmethod
    def save_file(self, source_path_or_bytes: Union[str, Path, bytes, BinaryIO], destination_subpath: str) -> str:
        """Saves a file to storage and returns its canonical storage URI/path."""
        pass

    @abstractmethod
    def get_file_bytes(self, storage_path: str) -> bytes:
        """Retrieves raw file bytes by storage path."""
        pass

    @abstractmethod
    def file_exists(self, storage_path: str) -> bool:
        """Checks if file exists at storage path."""
        pass

    @abstractmethod
    def delete_file(self, storage_path: str) -> bool:
        """Deletes file at storage path."""
        pass

    @abstractmethod
    def delete_directory(self, storage_subpath: str) -> bool:
        """Deletes directory and all its contents at storage path."""
        pass


class LocalStorage(StorageBackend):
    """Local filesystem storage backend."""

    def __init__(self, root_dir: Optional[Union[str, Path]] = None):
        if root_dir is None:
            self.root_dir = Path(os.getcwd()) / "storage_data"
        else:
            self.root_dir = Path(root_dir)
        self.root_dir.mkdir(parents=True, exist_ok=True)

    def _resolve_path(self, destination_subpath: str) -> Path:
        clean_subpath = destination_subpath.lstrip("/\\")
        full_path = (self.root_dir / clean_subpath).resolve()
        # Prevent directory traversal
        if not str(full_path).startswith(str(self.root_dir.resolve())):
            raise ValueError(f"Path traversal detected: {destination_subpath}")
        return full_path

    def save_file(self, source_path_or_bytes: Union[str, Path, bytes, BinaryIO], destination_subpath: str) -> str:
        target_path = self._resolve_path(destination_subpath)
        target_path.parent.mkdir(parents=True, exist_ok=True)

        if isinstance(source_path_or_bytes, (str, Path)):
            src = Path(source_path_or_bytes)
            shutil.copy2(src, target_path)
        elif isinstance(source_path_or_bytes, bytes):
            with open(target_path, "wb") as f:
                f.write(source_path_or_bytes)
        elif hasattr(source_path_or_bytes, "read"):
            with open(target_path, "wb") as f:
                shutil.copyfileobj(source_path_or_bytes, f)
        else:
            raise TypeError(f"Unsupported source type: {type(source_path_or_bytes)}")

        return str(target_path)

    def get_file_bytes(self, storage_path: str) -> bytes:
        p = Path(storage_path)
        if not p.is_absolute():
            p = self._resolve_path(storage_path)
        if not p.exists():
            raise FileNotFoundError(f"File not found in storage: {storage_path}")
        with open(p, "rb") as f:
            return f.read()

    def file_exists(self, storage_path: str) -> bool:
        p = Path(storage_path)
        if not p.is_absolute():
            p = self._resolve_path(storage_path)
        return p.exists() and p.is_file()

    def delete_file(self, storage_path: str) -> bool:
        p = Path(storage_path)
        if not p.is_absolute():
            p = self._resolve_path(storage_path)
        if p.exists() and p.is_file():
            p.unlink()
            return True
        return False

    def delete_directory(self, storage_subpath: str) -> bool:
        p = Path(storage_subpath)
        if not p.is_absolute():
            p = self._resolve_path(storage_subpath)
        if p.exists() and p.is_dir():
            shutil.rmtree(p, ignore_errors=True)
            return True
        return False
