/**
 * One-time copy of all collections from a local MongoDB database to Atlas.
 * Requires: local mongod running, Atlas reachable (IP allowlist), MONGODB_URI in .env.
 *
 * Usage (from backend/): npx tsx scripts/migrate-local-to-atlas.ts
 * Optional: MIGRATE_SOURCE_URI=mongodb://127.0.0.1:27017/other-db
 */
import 'dotenv/config'
import mongoose from 'mongoose'

const DEFAULT_SOURCE =
  process.env.MIGRATE_SOURCE_URI ||
  'mongodb://127.0.0.1:27017/smart-fertilizer'

const DEST = process.env.MONGODB_URI

async function main() {
  if (!DEST) {
    console.error('Set MONGODB_URI in backend/.env (Atlas connection string).')
    process.exit(1)
  }

  console.log('Source:', DEFAULT_SOURCE)
  console.log('Destination: (Atlas)')

  const source = mongoose.createConnection(DEFAULT_SOURCE)
  const dest = mongoose.createConnection(DEST)

  await source.asPromise()
  await dest.asPromise()

  const sdb = source.db
  const ddb = dest.db
  if (!sdb || !ddb) {
    throw new Error('Database handle missing after connect.')
  }

  const collections = (await sdb.listCollections().toArray()).filter(
    (c) => !c.name.startsWith('system.'),
  )

  let totalInserted = 0

  for (const { name } of collections) {
    const docs = await sdb.collection(name).find({}).toArray()
    if (docs.length === 0) {
      console.log(`[${name}] empty — skipped`)
      continue
    }

    try {
      const result = await ddb.collection(name).insertMany(docs, {
        ordered: false,
      })
      const n = Object.keys(result.insertedIds).length
      totalInserted += n
      console.log(`[${name}] inserted ${n} document(s)`)
    } catch (err: unknown) {
      const e = err as { insertedDocs?: unknown; writeErrors?: { length: number } }
      const inserted =
        e.insertedDocs && typeof e.insertedDocs === 'object'
          ? Object.keys(e.insertedDocs as object).length
          : 0
      const writeErrs = e.writeErrors?.length ?? 0
      if (inserted > 0) {
        totalInserted += inserted
        console.log(
          `[${name}] partial: ${inserted} inserted, ${writeErrs} error(s) (often duplicate _id if re-run)`,
        )
      } else {
        console.error(`[${name}] failed:`, err)
      }
    }
  }

  await source.close()
  await dest.close()

  console.log(`Done. Approx. ${totalInserted} document(s) inserted (see per-collection logs).`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
