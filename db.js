const Database = require('better-sqlite3');
const path = require('path');
const fs   = require('fs');
const { parseCsv } = require('./csv-parser');

const DB_PATH       = process.env.DB_PATH || path.join(__dirname, 'album.db');
const BAK_PATH      = DB_PATH.replace(/\.db$/, '') + '.bak.db';
const SNAPSHOT_PATH = DB_PATH.replace(/\.db$/, '') + '.snapshot.json';
const CSV_PATH      = path.join(__dirname, 'figurinhas_album_2026.csv');

// Faz backup antes de abrir, mas só se o banco tiver dados de uso
if (fs.existsSync(DB_PATH)) {
  try {
    const tmp = new Database(DB_PATH, { readonly: true });
    const { coladas } = tmp.prepare('SELECT COUNT(*) AS coladas FROM figurinhas WHERE colada = 1').get();
    const { reps }    = tmp.prepare('SELECT COUNT(*) AS reps FROM repetidas').get();
    tmp.close();
    if (coladas > 0 || reps > 0) {
      fs.copyFileSync(DB_PATH, BAK_PATH);
      console.log(`Backup criado: ${path.basename(BAK_PATH)} (${coladas} coladas, ${reps} repetidas)`);
    }
  } catch { /* ignora erros de leitura do backup */ }
}

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS figurinhas (
    codigo TEXT PRIMARY KEY,
    numero INTEGER NOT NULL,
    secao TEXT NOT NULL,
    sigla TEXT NOT NULL,
    nome_secao TEXT NOT NULL,
    ordem_secao INTEGER NOT NULL,
    colada INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS repetidas (
    pessoa TEXT NOT NULL,
    codigo TEXT NOT NULL,
    quantidade INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (pessoa, codigo),
    FOREIGN KEY (codigo) REFERENCES figurinhas(codigo)
  );

  CREATE INDEX IF NOT EXISTS idx_figurinhas_secao ON figurinhas(secao);
  CREATE INDEX IF NOT EXISTS idx_repetidas_pessoa ON repetidas(pessoa);
`);

// Migration: rename JAP → JPN in figurinhas and repetidas
if (db.prepare("SELECT COUNT(*) as c FROM figurinhas WHERE sigla = 'JAP'").get().c > 0) {
  db.pragma('foreign_keys = OFF');
  db.transaction(() => {
    for (let n = 1; n <= 20; n++) {
      db.prepare('UPDATE repetidas SET codigo = ? WHERE codigo = ?').run(`JPN${n}`, `JAP${n}`);
      db.prepare("UPDATE figurinhas SET codigo = ?, sigla = 'JPN', secao = 'Japão - JPN' WHERE codigo = ?")
        .run(`JPN${n}`, `JAP${n}`);
    }
  })();
  db.pragma('foreign_keys = ON');
  console.log('Migração: JAP → JPN concluída.');
}

// Migration: sync ordem_secao with current CSV order (idempotent)
{
  const sections = parseCsv(CSV_PATH);
  const updateOrdem = db.prepare('UPDATE figurinhas SET ordem_secao = ? WHERE secao = ?');
  db.transaction(() => {
    for (const sec of sections) updateOrdem.run(sec.ordemSecao, sec.secao);
  })();
}

// Seed only if empty
const count = db.prepare('SELECT COUNT(*) as c FROM figurinhas').get();
if (count.c === 0) {
  const sections = parseCsv(CSV_PATH);
  const insert = db.prepare(`
    INSERT INTO figurinhas (codigo, numero, secao, sigla, nome_secao, ordem_secao, colada)
    VALUES (@codigo, @numero, @secao, @sigla, @nomeSecao, @ordemSecao, 0)
  `);
  const insertMany = db.transaction((sections) => {
    for (const sec of sections) {
      for (const fig of sec.figurinhas) {
        insert.run(fig);
      }
    }
  });
  insertMany(sections);
  const total = db.prepare('SELECT COUNT(*) as c FROM figurinhas').get();
  console.log(`Seed concluído: ${total.c} figurinhas inseridas.`);

  // Restaura snapshot se existir — recupera dados após redeploy com DB vazio
  if (fs.existsSync(SNAPSHOT_PATH)) {
    try {
      const snap = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf-8'));
      const setColada = db.prepare('UPDATE figurinhas SET colada = 1 WHERE codigo = ?');
      const insRep    = db.prepare(
        'INSERT OR REPLACE INTO repetidas (pessoa, codigo, quantidade) VALUES (?, ?, ?)'
      );
      db.transaction(() => {
        for (const cod of (snap.coladas || [])) setColada.run(cod);
        for (const [pessoa, lista] of Object.entries(snap.repetidas || {})) {
          for (const { codigo, quantidade } of lista) {
            if (quantidade > 0) insRep.run(pessoa, codigo, quantidade);
          }
        }
      })();
      const nCol = (snap.coladas || []).length;
      const nRep = Object.values(snap.repetidas || {}).reduce((s, l) => s + l.length, 0);
      console.log(`Snapshot restaurado: ${nCol} coladas, ${nRep} repetidas.`);
    } catch (e) {
      console.error('Erro ao restaurar snapshot:', e.message);
    }
  }
}

module.exports = { db, SNAPSHOT_PATH };
