'use strict';

function parseRows(source) {
  const csv = source.replace(/^\uFEFF/, '');
  const delimiter = csv.split(/\r?\n/, 1)[0].includes(';') ? ';' : ',';
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let closed = false;
  for (let index = 0; index < csv.length; index++) {
    const char = csv[index];
    if (quoted) {
      if (char === '"' && csv[index + 1] === '"') {
        field += '"';
        index++;
      } else if (char === '"') {
        quoted = false;
        closed = true;
      } else field += char;
    } else if (char === delimiter || char === '\n' || char === '\r') {
      row.push(field.trim());
      field = '';
      closed = false;
      if (char !== delimiter) {
        if (row.some(Boolean)) rows.push(row);
        row = [];
        if (char === '\r' && csv[index + 1] === '\n') index++;
      }
    } else if (char === '"' && !field && !closed) quoted = true;
    else {
      if (closed || char === '"') throw new Error('Aspas inválidas no arquivo CSV.');
      field += char;
    }
  }
  if (quoted) throw new Error('Aspas não fechadas no arquivo CSV.');
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function parseTransactions(source) {
  const rows = parseRows(source);
  const header = rows.shift()?.map(value => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()) || [];
  const columns = ['descricao', 'data', 'tipo', 'valor', 'categoria'].map(label => header.indexOf(label));
  if (columns.includes(-1) || !rows.length || rows.length > 10000) {
    throw new Error('Use as colunas descrição, data, tipo, valor e categoria, com 1 a 10.000 lançamentos.');
  }
  return rows.map((row, index) => {
    const [title, rawDate, rawType, rawValue, category] = columns.map(column => row[column] ?? '');
    const type = { receita: 'income', despesa: 'expense', income: 'income', expense: 'expense' }[rawType.toLowerCase()];
    const date = rawDate.replace(/^(\d{2})\/(\d{2})\/(\d{4})$/, '$3-$2-$1');
    const value = rawValue.replace(/^R\$\s*/, '');
    const normalized = /^\d{1,3}(?:\.\d{3})+,\d{1,2}$/.test(value)
      ? value.replace(/\./g, '').replace(',', '.')
      : value.replace(',', '.');
    if (!type || !/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
      throw new Error(`Lançamento ${index + 1}: informe tipo Receita ou Despesa e um valor válido.`);
    }
    return { title, date, type, amount: Math.round(Number(normalized) * 100), category };
  });
}

module.exports = { parseTransactions };
