const Database = require('better-sqlite3');
const path = require('path');
const { parseCsv } = require('./csv-parser');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'album.db');
const CSV_PATH = path.join(__dirname, 'figurinhas_album_2026.csv');

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
}

module.exports = db;
