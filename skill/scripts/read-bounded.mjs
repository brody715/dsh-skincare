import { openSync, closeSync, fstatSync, readSync, constants } from 'node:fs'

/** Read regular UTF-8 files only, with a hard allocation/read ceiling (including growth). */
export function readBounded(path, maxBytes) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK)
  try {
    const stat = fstatSync(fd)
    if (!stat.isFile()) throw new Error(`不是普通文件: ${path}`)
    if (stat.size > maxBytes) throw new Error(`文件过大（上限 ${maxBytes} 字节）: ${path}`)
    const buffer = Buffer.alloc(maxBytes + 1)
    let size = 0
    while (size < buffer.length) {
      const n = readSync(fd, buffer, size, buffer.length - size, null)
      if (!n) break
      size += n
    }
    if (size > maxBytes) throw new Error(`文件过大（上限 ${maxBytes} 字节）: ${path}`)
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, size))
  } finally { closeSync(fd) }
}
