// Where report (.pptx) exports live.
//
// New exports are written to local disk (REPORT_STORAGE_DIR; in Docker a named
// volume, so files survive rebuilds). GCS was the original store, but its
// project's billing account was closed and every upload failed with 403 — so it
// is now only a read fallback for exports saved before the switch.
//
// The object name (`exports/<orgId>/<file>.pptx`) is the same key in both
// places, so `report_exports.gcs_object_name` needs no migration.
import { promises as fs } from 'fs'
import path from 'path'
import { downloadFromGCS, deleteFromGCS } from './gcs'

function storageRoot(): string {
  return path.resolve(process.env.REPORT_STORAGE_DIR ?? path.join(process.cwd(), '.data', 'reports'))
}

/** Absolute path for an object name, refusing anything that escapes the root. */
function localPath(objectName: string): string {
  const root = storageRoot()
  const full = path.resolve(root, objectName)
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error(`Invalid report object name: ${objectName}`)
  }
  return full
}

export async function saveReportFile(buffer: Buffer, objectName: string): Promise<void> {
  const full = localPath(objectName)
  await fs.mkdir(path.dirname(full), { recursive: true })
  await fs.writeFile(full, buffer)
}

/** Local disk first; falls back to GCS for exports saved before the switch. */
export async function readReportFile(objectName: string): Promise<Buffer> {
  try {
    return await fs.readFile(localPath(objectName))
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
  }
  return downloadFromGCS(objectName)
}

/** Removes the file wherever it lives; missing files are ignored. */
export async function deleteReportFile(objectName: string): Promise<void> {
  await fs.rm(localPath(objectName), { force: true })
  if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY && process.env.GCS_BUCKET_NAME) {
    await deleteFromGCS(objectName)
  }
}
