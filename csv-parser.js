const fs = require('fs');
const path = require('path');

function parseCsv(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n').slice(1); // skip header

  const sections = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Split on first comma only — secao may contain commas but codigos is quoted
    const firstComma = line.indexOf(',');
    const secao = line.slice(0, firstComma).trim();
    let codigosRaw = line.slice(firstComma + 1).trim();

    // Strip surrounding quotes if present
    if (codigosRaw.startsWith('"') && codigosRaw.endsWith('"')) {
      codigosRaw = codigosRaw.slice(1, -1);
    }

    const numeros = codigosRaw.split(',').map(n => parseInt(n.trim(), 10));

    // Derive sigla
    let sigla;
    let nomeSecao;

    if (secao.startsWith('FWC')) {
      if (secao.includes('Especiais')) {
        sigla = 'FWCE';
        nomeSecao = 'FWC Especiais';
      } else if (secao.includes('Bola')) {
        sigla = 'FWCB';
        nomeSecao = 'FWC - Bola e países';
      } else if (secao.includes('História') || secao.includes('Historia')) {
        sigla = 'FWCH';
        nomeSecao = 'FWC - História';
      } else {
        sigla = 'FWC';
        nomeSecao = secao;
      }
    } else {
      // Extract sigla after last ' - '
      const match = secao.match(/ - ([A-Z]+)\s*$/);
      sigla = match ? match[1] : secao.replace(/[^A-Z]/g, '');
      // Nome is everything before ' - SIGLA'
      nomeSecao = match ? secao.slice(0, secao.lastIndexOf(' - ' + match[1])).trim() : secao;
    }

    const figurinhas = numeros.map(num => ({
      codigo: `${sigla}${num}`,
      numero: num,
      secao,
      sigla,
      nomeSecao,
      ordemSecao: i,
    }));

    sections.push({ secao, sigla, nomeSecao, ordemSecao: i, figurinhas });
  }

  return sections;
}

module.exports = { parseCsv };
