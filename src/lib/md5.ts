/**
 * Media integrity helper: MD5 hash of an audio blob, computed once at import
 * time and shown in the terminal readouts (HASH: ...). Uses spark-md5's
 * ArrayBuffer incremental hasher; device-scanned songs have no blob and skip
 * hashing (path-only access), so their hash stays empty.
 */
import SparkMD5 from 'spark-md5';

export function md5Hex(data: ArrayBuffer): string {
  return SparkMD5.ArrayBuffer.hash(data).toUpperCase();
}
