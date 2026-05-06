'use strict';

const express = require('express');
const path = require('path');
const db = require('./db');

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// GET /api/figurinhas?pessoa=pedro
app.get('/api/figurinhas', (req, res) => {
  const pessoa = (req.query.pessoa || '').toLowerCase().trim();
  if (!pessoa) return res.status(400).json({ error: 'pessoa é obrigatório' });

  const rows = db.prepare(`
    SELECT f.codigo, f.numero, f.secao, f.sigla, f.nome_secao, f.ordem_secao,
           f.colada, COALESCE(r.quantidade, 0) AS repetidas
    FROM figurinhas f
    LEFT JOIN repetidas r ON r.codigo = f.codigo AND r.pessoa = ?
    ORDER BY f.ordem_secao ASC, f.numero ASC
  `).all(pessoa);

  const secaoMap = new Map();
  for (const row of rows) {
    if (!secaoMap.has(row.secao)) {
      secaoMap.set(row.secao, {
        nome: row.nome_secao,
        sigla: row.sigla,
        ordemSecao: row.ordem_secao,
        figurinhas: [],
      });
    }
    secaoMap.get(row.secao).figurinhas.push({
      codigo: row.codigo,
      numero: row.numero,
      colada: row.colada === 1,
      repetidas: row.repetidas,
    });
  }

  const secoes = [...secaoMap.values()].sort((a, b) => a.ordemSecao - b.ordemSecao);
  res.json({ secoes });
});

// POST /api/figurinhas/:codigo/colar  — toggle colada
app.post('/api/figurinhas/:codigo/colar', (req, res) => {
  const { codigo } = req.params;
  const fig = db.prepare('SELECT colada FROM figurinhas WHERE codigo = ?').get(codigo);
  if (!fig) return res.status(404).json({ error: 'Figurinha não encontrada' });

  const novo = fig.colada === 0 ? 1 : 0;
  db.prepare('UPDATE figurinhas SET colada = ? WHERE codigo = ?').run(novo, codigo);
  res.json({ colada: novo === 1 });
});

// POST /api/repetidas/:codigo  — body: { pessoa, delta: 1|-1 }
app.post('/api/repetidas/:codigo', (req, res) => {
  const { codigo } = req.params;
  const { pessoa, delta } = req.body;

  if (!pessoa || (delta !== 1 && delta !== -1)) {
    return res.status(400).json({ error: 'pessoa e delta (1 ou -1) são obrigatórios' });
  }

  const fig = db.prepare('SELECT codigo FROM figurinhas WHERE codigo = ?').get(codigo);
  if (!fig) return res.status(404).json({ error: 'Figurinha não encontrada' });

  const p = pessoa.toLowerCase().trim();
  const existing = db.prepare(
    'SELECT quantidade FROM repetidas WHERE pessoa = ? AND codigo = ?'
  ).get(p, codigo);

  let novaQtd;
  if (!existing) {
    novaQtd = Math.max(0, delta);
    if (novaQtd > 0) {
      db.prepare(
        'INSERT INTO repetidas (pessoa, codigo, quantidade) VALUES (?, ?, ?)'
      ).run(p, codigo, novaQtd);
    }
  } else {
    novaQtd = Math.max(0, existing.quantidade + delta);
    db.prepare(
      'UPDATE repetidas SET quantidade = ? WHERE pessoa = ? AND codigo = ?'
    ).run(novaQtd, p, codigo);
  }

  res.json({ quantidade: novaQtd });
});

// GET /api/stats?pessoa=pedro
app.get('/api/stats', (req, res) => {
  const pessoa = (req.query.pessoa || '').toLowerCase().trim();
  if (!pessoa) return res.status(400).json({ error: 'pessoa é obrigatório' });

  const { total } = db.prepare('SELECT COUNT(*) AS total FROM figurinhas').get();
  const { coladas } = db.prepare(
    'SELECT COUNT(*) AS coladas FROM figurinhas WHERE colada = 1'
  ).get();
  const faltam = total - coladas;
  const percentual = total > 0 ? parseFloat(((coladas / total) * 100).toFixed(2)) : 0;

  const { minhasRepetidasTotal } = db.prepare(
    'SELECT COALESCE(SUM(quantidade), 0) AS minhasRepetidasTotal FROM repetidas WHERE pessoa = ?'
  ).get(pessoa);

  const { minhasRepetidasUnicas } = db.prepare(
    'SELECT COUNT(*) AS minhasRepetidasUnicas FROM repetidas WHERE pessoa = ? AND quantidade > 0'
  ).get(pessoa);

  const porSecao = db.prepare(`
    SELECT nome_secao AS nome, secao, ordem_secao,
           SUM(colada) AS coladas, COUNT(*) AS total
    FROM figurinhas
    GROUP BY secao
    ORDER BY ordem_secao
  `).all();

  res.json({
    total,
    coladas,
    faltam,
    percentual,
    minhasRepetidasTotal,
    minhasRepetidasUnicas,
    porSecao: porSecao.map(s => ({
      nome: s.nome,
      secao: s.secao,
      coladas: s.coladas,
      total: s.total,
    })),
  });
});

// GET /api/trocas?pessoa=pedro
app.get('/api/trocas', (req, res) => {
  const pessoa = (req.query.pessoa || '').toLowerCase().trim();
  if (!pessoa) return res.status(400).json({ error: 'pessoa é obrigatório' });

  const minhasRepetidas = db.prepare(`
    SELECT codigo, quantidade FROM repetidas
    WHERE pessoa = ? AND quantidade > 0
    ORDER BY quantidade DESC, codigo ASC
  `).all(pessoa);

  const precisoColar = db.prepare(`
    SELECT codigo FROM figurinhas WHERE colada = 0 ORDER BY ordem_secao, numero
  `).all().map(r => r.codigo);

  res.json({ minhasRepetidas, precisoColar });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Álbum Copa 2026 rodando em http://localhost:${PORT}`));
