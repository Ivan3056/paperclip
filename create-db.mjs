import postgres from 'postgres';

const sql = postgres('postgres://postgres:postgres@localhost:5432/postgres');

try {
  await sql`CREATE DATABASE paperclip`;
  console.log('Database paperclip created');
} catch (e) {
  console.log('Database may already exist:', e.message);
} finally {
  await sql.end();
}
