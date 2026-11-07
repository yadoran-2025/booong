import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

if (!process.env.PGLITE_MODULE) throw new Error("Set PGLITE_MODULE to the local @electric-sql/pglite module path.");
const { PGlite } = await import(process.env.PGLITE_MODULE);
const db = new PGlite();
try {
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to anon,authenticated,service_role;");
  await db.exec(await readFile(new URL("../docs/erp/setup.sql", import.meta.url), "utf8"));
  const rls = await db.query("select relname,relrowsecurity from pg_class where relname in ('booong_research_entries','booong_research_entry_history')");
  assert.equal(rls.rows.length, 2); assert.ok(rls.rows.every(row => row.relrowsecurity));
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    await assert.rejects(db.query("select * from public.booong_research_entries"), /permission denied/);
    await assert.rejects(db.query("select * from public.booong_research_entry_history"), /permission denied/);
    await db.exec("reset role");
  }
  await db.exec("set role service_role");
  const id = "04c0a688-0b12-4da3-8c49-fc5850093b87";
  await db.query("insert into public.booong_research_entries (id,date,category,amount,title,updated_by) values ($1,'2026-11-04','coffee',4500,'커피','admin@example.com')", [id]);
  await assert.rejects(db.query("insert into public.booong_research_entries (id,date,category,amount,title,updated_by) values ($1,'2026-11-04','coffee',4500,'커피','admin@example.com')", [id]), /duplicate key/);
  for (const expression of ["amount=0", "category='invalid'", "date='2026-02-29'", "title=''"]) {
    await assert.rejects(db.query(`update public.booong_research_entries set ${expression}, revision=2 where id=$1`, [id]));
  }
  await assert.rejects(db.query("update public.booong_research_entries set revision=4 where id=$1", [id]), /Invalid entry revision/);
  await db.query("update public.booong_research_entries set amount=5000,revision=2 where id=$1 and revision=1", [id]);
  const conflict = await db.query("update public.booong_research_entries set amount=9999,revision=2 where id=$1 and revision=1 returning *", [id]);
  assert.equal(conflict.rows.length, 0);
  await db.query("update public.booong_research_entries set voided=true,revision=3 where id=$1", [id]);
  await db.query("update public.booong_research_entries set voided=false,revision=4 where id=$1", [id]);
  const history = await db.query("select * from public.booong_research_entry_history order by revision");
  assert.equal(history.rows.length, 4);
  assert.equal(history.rows[0].before_value, null);
  assert.equal(history.rows[1].before_value.amount, 4500);
  assert.equal(history.rows[1].after_value.amount, 5000);
  assert.equal(history.rows[2].after_value.voided, true);
  assert.equal(history.rows[3].after_value.voided, false);
  assert.ok(history.rows.every(row => row.actor === "admin@example.com"));
  await assert.rejects(db.query("delete from public.booong_research_entries"), /permission denied/);
  await assert.rejects(db.query("update public.booong_research_entry_history set actor='x'"), /permission denied/);
  await assert.rejects(db.query("delete from public.booong_research_entry_history"), /permission denied/);
  console.log("ERP setup SQL: local PostgreSQL tables, constraints, RLS/grants, atomic history, revision conflicts and deletion protection passed.");
} finally { await db.close(); }
